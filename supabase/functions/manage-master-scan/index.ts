// supabase/functions/manage-master-scan/index.ts
// ✅ دالة موحّدة تجمع start-master-scan-mode + stop-master-scan-mode + get-master-scan-status
// action: start | stop | status — كلها بمصادقة أدمن (JWT)، بعكس submit-master-card-scan اللي فضلت منفصلة (مصادقة جهاز)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, TokenPayload, AuthError, verifyToken } from "../_shared/auth.ts";

function requireAdmin(payload: TokenPayload) {
  if (payload.role !== "teacher" || payload.clientId !== "Fasli-admin") {
    throw new AuthError("⛔ غير مصرح بهذه العملية", 403);
  }
}

function authErrorResponse(error: unknown) {
  const status = error instanceof AuthError ? error.status : 500;
  const code = error instanceof AuthError ? error.code : undefined;
  const message = error instanceof Error ? error.message : "⚠️ خطأ غير معروف";
  return new Response(JSON.stringify({ success: false, message, ...(code ? { code } : {}) }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const payload = await verifyToken(req);
    requireAdmin(payload);
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } });

    const { action } = await req.json();

    // ✅ (أمان/وظيفي حرج) master_scan_mode صف واحد بس (singleton)، بس عموده id "generated
    // always as identity" — مفيش ضمان إنه هيكون id=1 بالظبط، وفعليًا مكانش موجود خالص في
    // القاعدة الجديدة بعد الترحيل. الكود القديم كان بيفترض id=1 صراحة عن طريق .eq("id", 1) —
    // لو الصف ده مش موجود، "start" كان بيرجع نجاح كاذب (تحديث لصفر صفوف، من غير أي error) من
    // غير ما يفعّل أي حاجة فعليًا في القاعدة، وأول استعلام "status" بعدها كان بيرجّع
    // isActive:false تاني على طول — يعني وضع الاستقبال كان بيظهر إنه "اشتغل" لحظة وبعدها
    // "بيفصل" فورًا، من غير أي كارت اتسجّل فعليًا في أي وقت.
    if (action === "start" || action === "stop") {
      const { data: existingMode } = await supabase.from("master_scan_mode").select("id").limit(1).maybeSingle();
      const isActive = action === "start";
      const updates: Record<string, unknown> = { is_active: isActive };
      if (isActive) updates.last_scanned_uid = null;

      if (existingMode) {
        await supabase.from("master_scan_mode").update(updates).eq("id", existingMode.id);
      } else if (isActive) {
        await supabase.from("master_scan_mode").insert(updates);
      }

      return new Response(JSON.stringify({
        success: true,
        message: isActive ? "✅ وضع الاستقبال مفعّل — مرّغ الكروت على البورد" : "✅ تم إيقاف وضع الاستقبال",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "status") {
      const { data: mode } = await supabase.from("master_scan_mode").select("is_active, last_scanned_uid").limit(1).maybeSingle();
      const { count } = await supabase.from("system_cards").select("id", { count: "exact", head: true }).eq("status", "in_stock");
      return new Response(JSON.stringify({
        success: true, isActive: !!mode?.is_active, lastScannedUid: mode?.last_scanned_uid || null, inStockCount: count || 0,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: false, message: "⚠️ action غير معروفة" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return new Response(JSON.stringify({ success: false, message: "⚠️ حدث خطأ غير متوقع، حاول مرة أخرى" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
