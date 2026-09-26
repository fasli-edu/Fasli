import { corsHeaders, verifyToken, authErrorResponse, requireAssistantPermission, AuthError } from "../_shared/auth.ts";
// supabase/functions/attendance-decisions/index.ts
// طابور "قرارات الحضور": لما طالب يمرّر كارته وهو مش تابع لمجموعة الحصة الشغّالة على القارئ،
// record-attendance بيسجّل طلب "بانتظار قرار" في pending_attendance_decisions بدل ما يرفض.
// الدالة دي بتخدم نافذة القرار في لوحة المدرس/المساعد:
//   list    ← الطلبات المعلّقة (ومنها بنكنّس المنتهية)
//   options ← الخيارات المتاحة لطلب معيّن (حصص فاتت يقدر يعوّضها / حصص قادمة يقدر يحضرها مبكر)
//   resolve ← reject | makeup_past | early_future — بيتنفّذ بشكل ذري (الأول بس اللي بيحسم)
// قاعدة التعويض: لازم نفس المدرس (instructor) في الحصتين، والصف بيفضل تابع لمجموعة الطالب
// الأصلية وحصتها عشان ماتتحسبش غياب، ومعاه علامة إنه حضر فعلياً في مجموعة تانية.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// (من _shared/push.ts — مدموج مباشرة لأن Dashboard لا يدعم الاستيراد بين الدوال)
// إرسال إشعارات Push حقيقية عبر Firebase Cloud Messaging (HTTP v1 API)
// ============================================
interface ServiceAccount { client_email: string; private_key: string; project_id: string; }
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function base64url(input: ArrayBuffer | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else bytes = new Uint8Array(input);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.token;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = { iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const pemBody = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64url(signature)}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) throw new Error("فشل مصادقة Firebase");
  cachedAccessToken = { token: tokenData.access_token, expiresAt: Date.now() + tokenData.expires_in * 1000 };
  return tokenData.access_token;
}

async function sendPushToRecipient(supabase: any, recipientType: "parent" | "assistant" | "teacher" | "student", recipientId: string, title: string, body: string): Promise<void> {
  try {
    const saJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!saJson) return;
    const { data: tokens } = await supabase.from("push_tokens").select("id, token").eq("recipient_type", recipientType).eq("recipient_id", recipientId);
    if (!tokens || tokens.length === 0) return;
    const sa: ServiceAccount = JSON.parse(saJson);
    const accessToken = await getAccessToken(sa);
    for (const row of tokens) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token: row.token, notification: { title, body }, android: { priority: "high", notification: { sound: "default", channel_id: "fasli_notifications" } } } }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData?.error?.status === "NOT_FOUND" || errData?.error?.status === "INVALID_ARGUMENT") {
          await supabase.from("push_tokens").delete().eq("id", row.id);
        } else { console.error("⚠️ فشل إرسال Push notification:", errData); }
      }
    }
  } catch (error) { console.error("⚠️ خطأ غير متوقع في إرسال Push notification:", error); }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAKEUP_LOOKBACK_DAYS = 30;
const MAX_FUTURE_DAYS = 90;

function cairoToday(): string {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" })).toISOString().split("T")[0];
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}
function sameInstructor(a: number | null | undefined, b: number | null | undefined): boolean {
  return (a ?? null) === (b ?? null);
}

// مجموعات الطالب الأصلية: الأساسية + المربوط بيها (student_group_links)
async function homeGroupsOf(supabase: any, studentUid: string, primaryGroup: string | null): Promise<string[]> {
  const { data: links } = await supabase.from("student_group_links").select("group_name").eq("student_uid", studentUid);
  return Array.from(new Set([primaryGroup, ...(links || []).map((l: any) => l.group_name)].filter(Boolean))) as string[];
}

// حصة عدّى وقتها فعلاً (يعني ينفع تتعوّض)؟
function sessionHasPassed(s: any, today: string, nowMs: number): boolean {
  if (s.scheduled_only) return false;
  if (s.session_date < today) return true;
  if (s.session_date > today) return false;
  if (s.ended_at) return true;
  const threshold = s.absence_threshold_minutes ?? 30;
  return (nowMs - new Date(s.created_at).getTime()) / 60000 >= threshold;
}

// المسار/الحصة اللي الطالب مرّر كارته فيها فعلياً (اللي التعويض/الحضور المبكر بيتم بسببها):
// - قرارات قديمة (سياق واحد): active_* في الصف نفسه
// - قرارات المسارات: من context.lanes (مسارات الحضور بس)؛ لو أكتر من مسار حضور لازم laneGroup يتحدد
type Visited = { groupName: string; sessionId: number | null; sessionLabel: string | null; instructorNameId: number | null; instructorName: string | null };
function attendanceLanesOf(decision: any): any[] {
  const lanes = (decision.context as any)?.lanes;
  return Array.isArray(lanes) ? lanes.filter((l: any) => l.attendance) : [];
}
function visitedOf(decision: any, laneGroup?: string | null): Visited | null {
  const hasLanes = Array.isArray((decision.context as any)?.lanes);
  if (hasLanes) {
    const att = attendanceLanesOf(decision);
    const pick = laneGroup ? att.find((l: any) => l.groupName === laneGroup) : (att.length === 1 ? att[0] : null);
    return pick
      ? { groupName: pick.groupName, sessionId: pick.sessionId ?? null, sessionLabel: pick.sessionLabel ?? null,
          instructorNameId: pick.instructorNameId ?? null, instructorName: pick.instructorName ?? null }
      : null;
  }
  return decision.active_group_name
    ? { groupName: decision.active_group_name, sessionId: decision.active_session_id, sessionLabel: decision.active_session_label,
        instructorNameId: decision.active_instructor_name_id, instructorName: decision.active_instructor_name }
    : null;
}

async function loadOwnedDecision(supabase: any, teacherId: string, decisionId: number) {
  const { data } = await supabase.from("pending_attendance_decisions").select("*")
    .eq("id", decisionId).eq("teacher_id", teacherId).maybeSingle();
  if (!data) return { error: json({ success: false, message: "⚠️ الطلب غير موجود" }, 404) };
  if (data.status !== "pending" || new Date(data.expires_at).getTime() < Date.now()) {
    return { error: json({ success: false, message: "⏱ الطلب ده انتهى أو اتحسم بالفعل" }, 409) };
  }
  return { decision: data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const payload = await verifyToken(req);
    // ✅ الدالة دي للمدرس/المساعد بس — توكن طالب/ولي أمر ممكن يشيل teacherId نفس المدرس
    if (payload.role !== "teacher" && payload.role !== "assistant") {
      throw new AuthError("⛔ غير مصرح بهذه العملية", 403);
    }
    await requireAssistantPermission(payload, "manage_attendance");
    const teacherId = (payload.clientId || payload.teacherId) as string;
    if (!teacherId) throw new AuthError("⚠️ التوكن لا يحتوي على clientId", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const today = cairoToday();
    const nowMs = Date.now();

    // ============ list ============
    if (action === "list") {
      await supabase.from("pending_attendance_decisions").update({ status: "expired" })
        .eq("teacher_id", teacherId).eq("status", "pending").lt("expires_at", new Date().toISOString());
      const { data } = await supabase.from("pending_attendance_decisions").select("*")
        .eq("teacher_id", teacherId).eq("status", "pending").order("created_at", { ascending: true }).limit(50);
      return json({ success: true, data: data || [], serverNow: new Date().toISOString() });
    }

    const decisionId = Number(body?.decisionId);
    if (!decisionId) return json({ success: false, message: "⚠️ decisionId مطلوب" }, 400);

    // ============ options ============
    if (action === "options") {
      const { decision, error } = await loadOwnedDecision(supabase, teacherId, decisionId);
      if (error) return error;
      const { data: student } = await supabase.from("students").select("uid, name, group_name")
        .eq("uid", decision.student_uid).eq("teacher_id", teacherId).maybeSingle();
      if (!student) return json({ success: false, message: "⚠️ الطالب غير موجود" }, 404);
      const homeGroups = await homeGroupsOf(supabase, student.uid, student.group_name);

      const attLanes = attendanceLanesOf(decision);
      const visited = visitedOf(decision, body?.laneGroup ? String(body.laneGroup) : null);
      // مفيش حصة زارها (مثلاً كل المسارات دفع بس)، أو فيه أكتر من مسار حضور والمستخدم لسه مختارش: مفيش قوايم
      if (!visited) {
        return json({
          success: true, student: { uid: student.uid, name: student.name, groupName: student.group_name },
          homeGroups, today, pastSessions: [], futureSessions: [], needLane: attLanes.length > 1,
          visitedLanes: attLanes.map((l: any) => ({ groupName: l.groupName, sessionLabel: l.sessionLabel, instructorName: l.instructorName })),
          activeInstructorName: null,
        });
      }

      const lookbackStart = addDays(today, -MAKEUP_LOOKBACK_DAYS);
      let sessionsQuery = supabase.from("attendance_sessions").select("*")
        .eq("teacher_id", teacherId).in("group_name", homeGroups)
        .gte("session_date", lookbackStart).lte("session_date", addDays(today, MAX_FUTURE_DAYS))
        .order("session_date", { ascending: false }).limit(200);
      sessionsQuery = visited.instructorNameId
        ? sessionsQuery.eq("instructor_name_id", visited.instructorNameId)
        : sessionsQuery.is("instructor_name_id", null);
      const { data: sessions } = await sessionsQuery;
      const candidates = (sessions || []).filter((s: any) => s.id !== visited.sessionId);

      const { data: rows } = candidates.length
        ? await supabase.from("attendance").select("id, session_id, is_absent, status")
            .eq("student_uid", student.uid).in("session_id", candidates.map((s: any) => s.id))
        : { data: [] as any[] };
      const rowBySession = new Map<number, any>((rows || []).map((r: any) => [r.session_id, r]));
      const attendedAlready = (sid: number) => {
        const r = rowBySession.get(sid);
        return !!r && !r.is_absent && r.status === "present";
      };

      const brief = (s: any) => ({
        id: s.id, groupName: s.group_name, label: s.session_label, date: s.session_date,
        instructorName: s.instructor_name, wasMarkedAbsent: !!rowBySession.get(s.id)?.is_absent,
      });
      const past = candidates.filter((s: any) => sessionHasPassed(s, today, nowMs) && !attendedAlready(s.id)).map(brief);
      const future = candidates
        .filter((s: any) => !sessionHasPassed(s, today, nowMs) && (s.scheduled_only || s.session_date > today) && !rowBySession.get(s.id))
        .sort((a: any, b: any) => a.session_date.localeCompare(b.session_date)).map(brief);

      return json({
        success: true,
        student: { uid: student.uid, name: student.name, groupName: student.group_name },
        homeGroups, activeInstructorName: visited.instructorName || null, today,
        visitedLanes: attLanes.map((l: any) => ({ groupName: l.groupName, sessionLabel: l.sessionLabel, instructorName: l.instructorName })),
        visitedGroup: visited.groupName,
        pastSessions: past, futureSessions: future,
      });
    }

    // ============ resolve ============
    if (action === "resolve") {
      const resolution = String(body?.resolution || "");
      if (!["reject", "makeup_past", "early_future", "run_lane"].includes(resolution)) {
        return json({ success: false, message: "⚠️ قرار غير معروف" }, 400);
      }

      // ✅ الحسم الذري: أول واحد (مدرس أو مساعد) بس اللي بيقلب الحالة من pending، التاني بيتلقى 409
      const { data: claimed } = await supabase.from("pending_attendance_decisions").update({
        status: resolution === "reject" ? "rejected" : "approved", resolution,
        resolved_by_role: payload.role, resolved_by_id: String(payload.sub), resolved_by_name: payload.name || null,
        resolved_at: new Date().toISOString(),
      }).eq("id", decisionId).eq("teacher_id", teacherId).eq("status", "pending")
        .gt("expires_at", new Date().toISOString()).select("*").maybeSingle();
      if (!claimed) return json({ success: false, message: "⏱ الطلب ده انتهى أو اتحسم بالفعل" }, 409);

      if (resolution === "reject") return json({ success: true, message: "تم رفض الطلب" });

      // لو التنفيذ فشل، بنرجّع الطلب معلّق ومدّة جديدة بدل ما يتحسم من غير ما يحصل حاجة فعلاً
      const revertEarly = async () => {
        await supabase.from("pending_attendance_decisions").update({
          status: "pending", resolution: null, resolved_by_role: null, resolved_by_id: null, resolved_by_name: null,
          resolved_at: null, expires_at: new Date(Date.now() + 3 * 60000).toISOString(),
        }).eq("id", decisionId);
      };

      // ============ run_lane: تنفيذ مسار معيّن (مسارين للطالب، أو دفع/مذكرة استثنائي لطالب من برّه المسار) ============
      // بيتم بنداء داخلي لـrecord-attendance نفسها (بنفس منطق المسحة الحقيقية بالظبط: قفل الدفع، منع
      // التكرار، الإشعارات...) بدل ما نكرّره هنا
      if (resolution === "run_lane") {
        const laneGroup = String(body?.laneGroup || "");
        const lanes = (claimed.context as any)?.lanes;
        if (!laneGroup || !Array.isArray(lanes) || !lanes.some((l: any) => l.groupName === laneGroup)) {
          await revertEarly();
          return json({ success: false, message: "⚠️ اختار المسار المراد تنفيذه" }, 400);
        }
        // ✅ تنفيذ مسار لطالب من برّه مجموعته (دفع/مذكرة استثنائي) عملية مالية بقرار المساعد نفسه: لازم
        // يكون معاه صلاحية الدفع/المذكرة زي أي تسجيل دفع يدوي. الطالب العضو في المسار (حالة مسارين) مابيتطلبش
        // ده لأن نفس المسار كان هيتنفّذ تلقائي على مسحته من غير أي قرار
        if (payload.role === "assistant" && claimed.reason === "no_lane") {
          const pickedLane = (lanes as any[]).find((l: any) => l.groupName === laneGroup);
          const { data: asst } = await supabase.from("assistants").select("permissions").eq("id", payload.sub).maybeSingle();
          const perms = asst?.permissions || {};
          if ((pickedLane?.payment && perms.record_payments !== true) || (pickedLane?.book && perms.manage_books !== true)) {
            await revertEarly();
            return json({ success: false, message: "⛔ ليس لديك صلاحية تسجيل الدفع/المذكرة، تواصل مع المدرس" }, 403);
          }
        }
        try {
          const { data: teacherDev } = await supabase.from("teachers").select("device_secret").eq("client_id", teacherId).maybeSingle();
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
          const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/record-attendance`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "x-internal-key": serviceKey },
            body: JSON.stringify({ clientId: teacherId, uid: claimed.card_uid || claimed.student_uid, secret: teacherDev?.device_secret, forceLaneGroup: laneGroup }),
          });
          const out = await r.json().catch(() => ({}));
          // نجاح، أو "اتسجّل قبل كده" (تكرار) — الاتنين قرار نفّذ أثره فعلاً
          if (out.success || out.message === "DUPLICATE_IGNORE") {
            return json({ success: true, message: out.success ? `✅ ${out.message}` : "ℹ️ الطالب متسجّل في المسار ده بالفعل" });
          }
          await revertEarly();
          return json({ success: false, message: out.message || "⚠️ تعذر تنفيذ المسار" }, 400);
        } catch (e) {
          await revertEarly();
          console.error("❌ فشل تنفيذ المسار:", e);
          return json({ success: false, message: "⚠️ حصل خطأ أثناء التنفيذ، الطلب رجع للانتظار" }, 500);
        }
      }

      const revert = async () => {
        await supabase.from("pending_attendance_decisions").update({
          status: "pending", resolution: null, resolved_by_role: null, resolved_by_id: null, resolved_by_name: null,
          resolved_at: null, expires_at: new Date(Date.now() + 3 * 60000).toISOString(),
        }).eq("id", decisionId);
      };
      const fail = async (message: string, status = 400) => { await revert(); return json({ success: false, message }, status); };

      try {
        const { data: student } = await supabase.from("students").select("uid, name, group_name, parent_phone")
          .eq("uid", claimed.student_uid).eq("teacher_id", teacherId).maybeSingle();
        if (!student) return await fail("⚠️ الطالب غير موجود", 404);
        const homeGroups = await homeGroupsOf(supabase, student.uid, student.group_name);

        const now = new Date();
        const timeStr = now.toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" });
        const visited = visitedOf(claimed, body?.laneGroup ? String(body.laneGroup) : null);
        if (!visited) return await fail("⚠️ مفيش حصة حضور نشطة تتعوّض بيها — اختار المسار");
        const visitedGroup = visited.groupName;
        const visitedLabel = visited.sessionLabel ? ` (${visited.sessionLabel})` : "";
        const baseFields = {
          student_uid: student.uid, student_name: student.name, teacher_id: teacherId,
          time: timeStr, status: "present", is_absent: false, is_manual: true,
          instructor_name_id: visited.instructorNameId, instructor_name: visited.instructorName,
          is_makeup: true, attended_via_group: visitedGroup, attended_via_session_id: visited.sessionId,
        };
        let targetSession: any = null;
        let notifTitle = "";
        let parentMsg = "";
        let studentMsg = "";
        let notes = "";

        const { data: teacherInfo } = await supabase.from("teachers").select("name").eq("client_id", teacherId).maybeSingle();
        const teacherLabel = teacherInfo?.name ? ` — مدرس ${teacherInfo.name}` : "";

        if (resolution === "makeup_past") {
          const { data: s } = await supabase.from("attendance_sessions").select("*")
            .eq("id", Number(body?.targetSessionId)).eq("teacher_id", teacherId).maybeSingle();
          if (!s || !homeGroups.includes(s.group_name)) return await fail("⚠️ الحصة المحددة غير صالحة للتعويض");
          if (!sameInstructor(s.instructor_name_id, visited.instructorNameId)) {
            return await fail("⛔ التعويض لازم يكون مع نفس المدرس في الحصتين");
          }
          if (s.session_date < addDays(today, -MAKEUP_LOOKBACK_DAYS) || !sessionHasPassed(s, today, nowMs)) {
            return await fail("⚠️ الحصة دي مش متاحة للتعويض (لسه ماحصلتش أو أقدم من 30 يوم)");
          }
          targetSession = s;
          notes = `تعويض — حضر بتاريخ ${today} مع مجموعة "${visitedGroup}"`;
          const { data: existingRow } = await supabase.from("attendance").select("id, is_absent, status")
            .eq("student_uid", student.uid).eq("session_id", s.id).maybeSingle();
          if (existingRow && !existingRow.is_absent && existingRow.status === "present") {
            return await fail("⚠️ الطالب حاضر في الحصة دي بالفعل");
          }
          const makeupFields = { ...baseFields, notes, makeup_type: "past" };
          const { error: writeError } = existingRow
            ? await supabase.from("attendance").update(makeupFields).eq("id", existingRow.id)
            : await supabase.from("attendance").insert({
                ...makeupFields, group_name: s.group_name, date: s.session_date, session_id: s.id, session_label: s.session_label,
              });
          if (writeError) {
            return await fail(writeError.code === "23505" ? "⚠️ الطالب حاضر في الحصة دي بالفعل" : "⚠️ تعذر تسجيل التعويض", 409);
          }
          notifTitle = "حضور تعويضي";
          const sLabel = s.session_label || "الحصة";
          parentMsg = `${student.name} عوّض ${sLabel} (${s.session_date}) بالحضور مع مجموعة "${visitedGroup}"${visitedLabel} اليوم الساعة ${timeStr}${teacherLabel}`;
          studentMsg = `اتسجّل حضورك كتعويض عن ${sLabel} (${s.session_date}) مع مجموعة "${visitedGroup}"${visitedLabel} اليوم الساعة ${timeStr}${teacherLabel}`;
        } else {
          // early_future: حصة موجودة مسبقاً، أو إنشاء حصة جديدة بتاريخ مستقبلي لمجموعة الطالب
          if (body?.targetSessionId) {
            const { data: s } = await supabase.from("attendance_sessions").select("*")
              .eq("id", Number(body.targetSessionId)).eq("teacher_id", teacherId).maybeSingle();
            if (!s || !homeGroups.includes(s.group_name)) return await fail("⚠️ الحصة المحددة غير صالحة");
            if (!sameInstructor(s.instructor_name_id, visited.instructorNameId)) {
              return await fail("⛔ لازم يكون نفس المدرس في الحصتين");
            }
            if (sessionHasPassed(s, today, nowMs) || !(s.scheduled_only || s.session_date > today)) {
              return await fail("⚠️ الحصة دي بدأت بالفعل أو عدّى وقتها");
            }
            targetSession = s;
          } else {
            const newGroup = String(body?.newSession?.groupName || "");
            const newDate = String(body?.newSession?.sessionDate || "");
            const newLabel = String(body?.newSession?.sessionLabel || "").trim();
            if (!homeGroups.includes(newGroup)) return await fail("⚠️ اختار مجموعة الطالب الأصلية للحصة القادمة");
            if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || newDate < today || newDate > addDays(today, MAX_FUTURE_DAYS)) {
              return await fail("⚠️ تاريخ الحصة القادمة لازم يكون من النهاردة لحد 90 يوم قدام");
            }
            if (!newLabel) return await fail("⚠️ اكتب اسم الحصة القادمة");
            const { data: created, error: createError } = await supabase.from("attendance_sessions").insert({
              teacher_id: teacherId, group_name: newGroup, session_label: newLabel, session_date: newDate,
              instructor_name_id: visited.instructorNameId, instructor_name: visited.instructorName,
              absence_threshold_minutes: 30, scheduled_only: true,
              created_by_role: payload.role, created_by_id: String(payload.sub), created_by_name: payload.name || null,
            }).select("*").single();
            if (createError || !created) return await fail("⚠️ تعذر إنشاء الحصة القادمة", 500);
            targetSession = created;
          }
          notes = `حضور مبكر — حضر بتاريخ ${today} مع مجموعة "${visitedGroup}"`;
          const { error: writeError } = await supabase.from("attendance").insert({
            ...baseFields, notes, makeup_type: "early", group_name: targetSession.group_name, date: targetSession.session_date,
            session_id: targetSession.id, session_label: targetSession.session_label,
          });
          if (writeError) {
            return await fail(writeError.code === "23505" ? "⚠️ الطالب مسجّل في الحصة دي بالفعل" : "⚠️ تعذر تسجيل الحضور المبكر", 409);
          }
          notifTitle = "حضور مبكر";
          const sLabel = targetSession.session_label || "الحصة القادمة";
          parentMsg = `${student.name} حضر مقدّمًا ${sLabel} (${targetSession.session_date}) مع مجموعة "${visitedGroup}"${visitedLabel} اليوم الساعة ${timeStr}${teacherLabel}`;
          studentMsg = `اتسجّل حضورك مقدّمًا في ${sLabel} (${targetSession.session_date}) مع مجموعة "${visitedGroup}"${visitedLabel} اليوم الساعة ${timeStr}${teacherLabel}`;
        }

        // ✅ إشعار مستقل ومفصّل لكل جمهور — نفس نمط باقي الحضور (طالب بصيغة المخاطب، ولي الأمر بالاسم)
        const details = {
          student_name: student.name, time: timeStr, date: today, makeup_type: resolution === "makeup_past" ? "past" : "early",
          target_session_label: targetSession.session_label, target_session_date: targetSession.session_date,
          target_group: targetSession.group_name, attended_group: visitedGroup, attended_session_label: visited.sessionLabel,
        };
        await supabase.from("notifications").insert([
          ...(student.parent_phone ? [{
            teacher_id: teacherId, parent_phone: student.parent_phone, student_uid: student.uid, type: "attendance",
            title: notifTitle, audience: "parent", message: parentMsg, details,
          }] : []),
          { teacher_id: teacherId, student_uid: student.uid, type: "attendance", title: notifTitle, audience: "student", message: studentMsg, details },
        ]).then(({ error }: any) => { if (error) console.error("⚠️ فشل إشعار الحضور التعويضي:", error.message); });
        if (student.parent_phone) sendPushToRecipient(supabase, "parent", student.parent_phone, notifTitle, parentMsg);
        sendPushToRecipient(supabase, "student", student.uid, notifTitle, studentMsg);

        await supabase.from("activity_logs").insert({
          client_id: teacherId, teacher_id: teacherId, action_type: "record_attendance", entity_type: "attendance",
          entity_id: student.uid, details: { student_name: student.name, student_uid: student.uid, is_manual: true, makeup: resolution, notes },
          performer_id: String(payload.sub), performer_role: payload.role, performer_name: payload.name || (payload.role === "assistant" ? "مساعد" : "مدرس"),
        }).then(({ error }: any) => { if (error) console.error("⚠️ فشل تسجيل النشاط:", error.message); });

        return json({
          success: true,
          message: resolution === "makeup_past"
            ? `✅ اتسجّل تعويض ${student.name} عن ${targetSession.session_label || "الحصة"} (${targetSession.session_date})`
            : `✅ اتسجّل حضور ${student.name} مقدّمًا في ${targetSession.session_label || "الحصة القادمة"} (${targetSession.session_date})`,
        });
      } catch (e) {
        await revert();
        console.error("❌ فشل تنفيذ قرار الحضور:", e);
        return json({ success: false, message: "⚠️ حصل خطأ أثناء التنفيذ، الطلب رجع للانتظار" }, 500);
      }
    }

    return json({ success: false, message: "⚠️ action غير معروف" }, 400);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error("❌ خطأ:", error);
    return json({ success: false, message: error instanceof Error ? error.message : "حدث خطأ داخلي" }, 500);
  }
});
