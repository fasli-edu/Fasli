// supabase/functions/get-master-device-secret/index.ts
// يرجّع (أو يولّد أول مرة) مفتاح بورد الماستر المخصص لاستقبال كروت المخزون
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

import { corsHeaders, AuthError, verifyToken, requireAdmin, authErrorResponse } from "../_shared/auth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("DATABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE") || "";
if (!supabaseKey) {
  throw new Error("⚠️ SERVICE_ROLE غير مضبوط في متغيرات البيئة");
}
const supabase = createClient(supabaseUrl, supabaseKey);

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders, status: 200 });

  try {
    const payload = await verifyToken(req);
    requireAdmin(payload);

    const body = await req.json().catch(() => ({}));
    const forceRegenerate = body?.regenerate === true;

    // ✅ (أمان/وظيفي حرج) الجدول ده صف واحد بس (singleton)، بس عموده id "generated always as
    // identity" — يعني مفيش ضمان إن الصف ده هيكون id=1 بالظبط (وفعليًا مكانش موجود خالص لسه في
    // القاعدة الجديدة بعد الترحيل). الكود القديم كان بيفترض id=1 صراحة: .eq("id", 1) في الـselect
    // والـupdate مع بعض — لو الصف ده مش موجود، الـupdate كان بيرجع نجاح كاذب (0 صفوف اتأثرت، من
    // غير أي error) والمفتاح المولّد كان بيترجع للواجهة بس من غير ما يتحفظ فعليًا في القاعدة —
    // فكل ضغطة على "عرض المفتاح" كانت بتولّد مفتاح عشوائي جديد تمامًا وتعرضه، من غير ما يستقر
    // أبداً. الحل: نجيب الصف الوحيد الموجود (لو موجود) بأي id كان، ونستخدم id الحقيقي بتاعه في
    // أي تحديث؛ ولو مفيش صف خالص، ننشئ واحد جديد (INSERT) بدل التحديث الوهمي.
    const { data: device, error } = await supabase
      .from("master_device").select("id, device_secret").limit(1).maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ success: false, message: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let secret = device?.device_secret;
    if (!secret || forceRegenerate) {
      secret = generateSecret();
      const writeError = device
        ? (await supabase.from("master_device").update({ device_secret: secret }).eq("id", device.id)).error
        : (await supabase.from("master_device").insert({ device_secret: secret })).error;
      if (writeError) {
        return new Response(JSON.stringify({ success: false, message: writeError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({ success: true, data: { deviceSecret: secret } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return new Response(JSON.stringify({ success: false, message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
