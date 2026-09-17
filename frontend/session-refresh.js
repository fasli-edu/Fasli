// frontend/session-refresh.js
// ============================================
// تجديد تلقائي لتوكن Supabase Auth في الخلفية — من غير ده، الجلسة كانت هتنقطع فجأة بعد
// ساعة واحدة بس (الصلاحية الافتراضية لتوكن Supabase) بدل 7 أيام زي النظام القديم.
// بيشتغل بصمت في الخلفية: يهيّئ جلسة Supabase من التوكنات المخزّنة، وبعدين أي مرة
// Supabase يجدد التوكن تلقائيًا (قبل انتهائه بشوية) بيكتب القيم الجديدة في نفس المكان
// اللي كل صفحات النظام بتقرأ منه (sessionStorage/localStorage.jwtToken).
//
// ✅ العميل ده persistSession:true عمداً (مش false) — تخزين حقيقي بيفضل موجود حتى لو
// الصفحة اتقفلت وتفتحت تاني، بدل تخزين مؤقت (in-memory) بيضيع فورًا.
// ============================================
(function () {
  const PROJECT_URL = 'https://ugvuwiaemrrtwplphkdn.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVndnV3aWFlbXJydHdwbHBoa2RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NjMyNjIsImV4cCI6MjEwNTIzOTI2Mn0.Vb5eh4DZhVJe-7m9sgM4ztXKJRbOAXDRT5oeeUv8boY';

  const Preferences = window.Capacitor?.Plugins?.Preferences;

  function getStored(key) {
    return sessionStorage.getItem(key) || localStorage.getItem(key) || null;
  }

  function isRemembered() {
    return localStorage.getItem('fasliRememberMe') === 'true';
  }

  // ✅ (أمان/وظيفي حرج) Supabase بيجدّد الـrefresh token تلقائيًا في الخلفية كل ما التطبيق
  // فاضل مفتوح — وتوكن الاسترجاع ده يُستخدم لمرة واحدة بس (يتجدد/يُلغى القديم في نفس اللحظة).
  // كنا بنكتب النسخة الجديدة في localStorage بس، مش في Preferences/electronStore (التخزين
  // الحقيقي اللي بيفضل موجود بعد Force Stop) — فلو المستخدم قفل التطبيق فعليًا بعد ما حصل
  // تجديد خلفي واحد بس وفتحه تاني، login.html كان بيسترجع التوكن **القديم الملغي** من
  // Preferences ويفشل يجدده، ويرجّع المستخدم لتسجيل الدخول من الأول رغم إن "تذكرني" شغّالة.
  function persist(key, value) {
    sessionStorage.setItem(key, value);
    if (!isRemembered()) return;
    localStorage.setItem(key, value);
    if (Preferences) Preferences.set({ key, value }).catch(() => {});
    if (window.electronStore) window.electronStore.set(key, value).catch(() => {});
  }

  async function init() {
    if (!window.supabase) return; // فشل تحميل مكتبة Supabase من الـCDN — تجاهل بصمت

    // ✅ لو الصفحة دي راجعة من ربط جوجل (أو أي OAuth تاني)، الرابط بيحتوي على كود/توكنات
    // جديدة لازم Supabase يعالجها بنفسه (detectSessionInUrl) — من غير ما نكتب فوقها بتوكن
    // قديم من التخزين قبل ما تتعالج
    const hasOAuthCallback = window.location.hash.includes('access_token=')
      || new URLSearchParams(window.location.search).has('code');

    try {
      const client = window.supabase.createClient(PROJECT_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: hasOAuthCallback },
      });

      client.auth.onAuthStateChange((event, session) => {
        if (session) {
          persist('jwtToken', session.access_token);
          persist('refreshToken', session.refresh_token);
        }
      });

      if (hasOAuthCallback) {
        // ✅ نستنى Supabase يخلص معالجة الرابط ويصدر الجلسة الجديدة — بتوصلنا عن طريق
        // onAuthStateChange فوق، فبنستخدم getSession() بس عشان نستنى الجاهزية
        await client.auth.getSession();
      } else {
        const token = getStored('jwtToken');
        const refreshToken = getStored('refreshToken');
        if (!token || !refreshToken) return; // مفيش جلسة Supabase Auth كاملة (حساب لسه م اتهاجرش، أو مش مسجل دخول)
        const { error } = await client.auth.setSession({ access_token: token, refresh_token: refreshToken });
        if (error) return; // توكن/refresh غير صالحين — نسيب باقي الصفحة تتعامل مع 401 زي ما هي
      }

      // ✅ لازم نفضل ماسكين مرجع للعميل ده — Supabase بيجدول التجديد التلقائي داخليًا
      // (setTimeout قبل انتهاء الصلاحية بشوية)، ولو العميل اتنضف من الذاكرة (garbage collected)
      // التجديد مش هيحصل خالص.
      window.__fasliSessionClient = client;
    } catch (e) {
      // ✅ أي فشل هنا لازم يتجاهل بصمت — تحسين خلفي اختياري، مش لازم يعطّل الصفحة الأساسية
    }
  }

  // ✅ (طلب) session-restore.js (محمّل مبكرًا في الصفحة) بيعمل window.__fasliSessionReady
  // بنفسه قبل ما الملف ده يتحمّل خالص — عشان أي fetch بيحصله 401 على توكن قديم من "تذكرني"
  // يقدر يستنى محاولة التجديد دي قبل ما يستسلم ويسجّل خروج المستخدم. هنا بس بنحلّ نفس
  // الـpromise ده (مش بننشئ واحد جديد يبوّظ اللي already منتظرين عليه)، وبنضمن إنه بيتحلّ
  // في كل الحالات حتى لو init() رجعت بدري (مفيش توكن أصلاً، فشل الشبكة، إلخ)
  function resolveSessionReady() {
    if (window.__fasliSessionReadyResolve) { window.__fasliSessionReadyResolve(); window.__fasliSessionReadyResolve = null; }
  }
  async function runInit() {
    try { await init(); } finally { resolveSessionReady(); }
  }
  if (!window.__fasliSessionReady) {
    // ✅ احتياطي لو الصفحة دي مش محمّلة معاها session-restore.js لأي سبب
    window.__fasliSessionReady = new Promise((resolve) => { window.__fasliSessionReadyResolve = resolve; });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit);
  } else {
    runInit();
  }
})();
