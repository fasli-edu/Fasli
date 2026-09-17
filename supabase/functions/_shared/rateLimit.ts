// supabase/functions/_shared/rateLimit.ts
// ============================================
// حماية عامة من الاستخدام المتكرر/التخمين (rate limiting)
// يعتمد على جدول login_attempts (key, attempts, locked_until, last_attempt)
// نفس الجدول يُستخدم لأي مفتاح (login أو change-password...) بادئة مختلفة فقط
// ============================================
// اسم مستعار فريد عمداً لتفادي أي تعارض مع "createClient" في الملفات اللي بتدمج هذا الموديول
import { createClient as _createRateLimitClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export interface RateLimitOptions {
  maxAttempts?: number;   // الحد الأقصى للمحاولات قبل الحظر (افتراضي 5)
  lockMinutes?: number;   // مدة الحظر بالدقائق (افتراضي 15)
}

function adminClient() {
  // ✅ نفس التصحيح المطبّق في _shared/auth.ts — الترتيب الصحيح SUPABASE_* الأول
  const url = Deno.env.get("SUPABASE_URL") || Deno.env.get("DATABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE") || "";
  return _createRateLimitClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** يتحقق هل المفتاح محظور حالياً. يرجّع رسالة عربية جاهزة لو محظور. */
export async function checkRateLimit(
  key: string,
  opts: RateLimitOptions = {}
): Promise<{ blocked: boolean; message?: string }> {
  const supabase = adminClient();
  const { data } = await supabase
    .from("login_attempts")
    .select("attempts, locked_until")
    .eq("username", key)
    .maybeSingle();

  if (data?.locked_until && new Date(data.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(data.locked_until).getTime() - Date.now()) / 60000);
    return { blocked: true, message: `⛔ تم حظر المحاولات مؤقتاً، حاول بعد ${minutes} دقيقة` };
  }
  return { blocked: false };
}

/** يسجّل محاولة فاشلة، ويحظر المفتاح تلقائياً لو تخطى الحد الأقصى
 * ✅ (أمان حرج) كان بيقرأ العدد الحالي (SELECT) وبعدين يكتب القيمة الجديدة (UPSERT) في نداءين
 * منفصلين، مش عملية ذرية واحدة — طلبات متزامنة (هجوم بروت-فورس بيبعت عشرات المحاولات في نفس
 * اللحظة) كل واحدة بتقرأ نفس العدد القديم قبل ما أي واحدة تكتب الجديد، فالحد الأقصى بيتخطّى
 * بسهولة تحت التوازي. دلوقتي بيستخدم دالة SQL واحدة ذرّية بالكامل (INSERT ... ON CONFLICT) —
 * Postgres بيقفل الصف نفسه أثناء المعاملات المتزامنة على نفس المفتاح، فمفيش سباق ممكن يحصل. */
export async function registerFailedAttempt(key: string, opts: RateLimitOptions = {}) {
  const maxAttempts = opts.maxAttempts ?? 5;
  const lockMinutes = opts.lockMinutes ?? 15;

  const supabase = adminClient();
  await supabase.rpc("register_login_attempt", {
    p_username: key,
    p_max_attempts: maxAttempts,
    p_lock_minutes: lockMinutes,
  });
}

/** يصفّر عداد المحاولات عند النجاح */
export async function clearAttempts(key: string) {
  const supabase = adminClient();
  await supabase.from("login_attempts").delete().eq("username", key);
}
