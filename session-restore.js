// frontend/session-restore.js
// ============================================
// لازم يتحمّل مبكرًا في <head> قبل أي كود تاني في الصفحة — بينسخ بيانات الجلسة من
// localStorage لـsessionStorage لو "تذكرني" كانت مفعّلة وقت الدخول. من غيره: قفل
// المتصفح/التطبيق تمامًا وفتحه تاني بيمسح sessionStorage تلقائيًا (سلوك المتصفح الطبيعي)،
// فالصفحة كانت بتعتبر المستخدم مسجّل خروج حتى لو "تذكرني" كانت متفعّلة، إلا لو دخوله
// عن طريق login.html بالظبط (اللي فيه نفس المنطق ده لوحده) — دلوقتي بقى شغال من أي صفحة.
// ============================================
(function () {
  try {
    if (!sessionStorage.getItem('jwtToken') && localStorage.getItem('fasliRememberMe') === 'true') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key === 'fasliRememberMe') continue;
        const value = localStorage.getItem(key);
        if (value !== null) sessionStorage.setItem(key, value);
      }
    }
  } catch (e) {
    // ✅ أي فشل هنا (خصوصية متصفح، وضع تصفّح خفي، إلخ) لازم يتجاهل بصمت
  }

  // ============================================
  // ✅ (طلب) "تذكرني" كانت بترجّع التوكن القديم صح، لكن لو كان خلاص منتهي الصلاحية (توكنات
  // Supabase بتنتهي بعد ساعة تقريباً — أي فتح للتطبيق بعد غيبة أطول من كده)، أول نداء بيانات
  // في الصفحة (زي loadGroups) كان بيتنفّذ فورًا بنفس التوكن القديم قبل ما session-refresh.js
  // (اللي محمّل آخر الصفحة عادةً) يلحق يجدده — يرجع 401، والصفحة كانت بتعتبرها نهاية الجلسة
  // فعليًا وتسجّل خروج المستخدم، رغم إن الـrefresh token لسه صالح وكان ممكن يجدد التوكن عادي.
  // الحل: نغلّف window.fetch من هنا (بداية الصفحة، قبل أي نداء تاني) عشان أي 401 من دوال
  // Supabase نحاول نجدد التوكن فعليًا (مش بس نستنى إشارة قديمة) ونعيد نفس الطلب مرة واحدة
  // بالتوكن الجديد قبل ما نستسلم.
  //
  // ✅ (تعديل حرج لاحق) الإصدار الأول كان بس بيستنى window.__fasliSessionReady — وده
  // بروميس *لمرة واحدة بس* بيتحل عند تحميل الصفحة، مش إشارة متجدّدة. يعني كان بيصلّح
  // السباق في أول ثوانٍ من فتح الصفحة بس، لكن لو التوكن انتهى بعد كده بساعة وإحنا لسه
  // فاتحين نفس الصفحة (الـpromise خلاص اتحل من زمان)، انتظاره كان بيرجع فورًا من غير ما
  // يجدد حاجة فعلاً — فكانت الرسالة "التوكن غير صالح" ترجع تظهر بالظبط في السيناريو ده،
  // وهو الأكتر شيوعًا فعليًا (مش بس أول فتح للتطبيق). الحل: دالة تجديد فعلية بتتصل مباشرة
  // بـSupabase Auth بالـrefresh token المخزّن، مش بس تستنى إشارة قديمة.
  // ============================================
  try {
    if (window.__fasliFetchRetryInstalled) return;
    window.__fasliFetchRetryInstalled = true;

    const PROJECT_URL = 'https://ugvuwiaemrrtwplphkdn.supabase.co';
    const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVndnV3aWFlbXJydHdwbHBoa2RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NjMyNjIsImV4cCI6MjEwNTIzOTI2Mn0.Vb5eh4DZhVJe-7m9sgM4ztXKJRbOAXDRT5oeeUv8boY';
    const originalFetch = window.fetch.bind(window);

    // ✅ بروميس مشترك قديم — لسه موجود عشان أي كود تاني (زي handleUnauthorized في صفحات
    // تانية) بيستنى عليه وقت التحميل الأول للصفحة بالذات، لكنه مش المصدر الوحيد للتجديد بقى
    window.__fasliSessionReadyResolve = null;
    window.__fasliSessionReady = new Promise((resolve) => { window.__fasliSessionReadyResolve = resolve; });
    setTimeout(() => { if (window.__fasliSessionReadyResolve) window.__fasliSessionReadyResolve(); }, 6000);

    // ✅ (أمان/وظيفي حرج) refresh token بتاع Supabase يُستخدم لمرة واحدة بس وبيتجدد نفسه —
    // لو نداءين لصفحات/تابات مختلفة حاولوا يجدّدوا في نفس اللحظة، التاني هيفشل لأن الأول
    // كان خلاص استهلك الـtoken القديم. الـ singleton ده بيضمن محاولة تجديد واحدة بس في نفس
    // الوقت، وأي حد تاني محتاج نفس النتيجة بينتظر نفس الـpromise بدل ما يبدأ محاولة مستقلة
    window.__fasliActiveRefresh = function () {
      if (window.__fasliRefreshInFlight) return window.__fasliRefreshInFlight;
      window.__fasliRefreshInFlight = (async () => {
        try {
          const refreshToken = sessionStorage.getItem('refreshToken');
          if (!refreshToken) return null;
          const res = await originalFetch(PROJECT_URL + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          if (!data?.access_token || !data?.refresh_token) return null;

          const isRemembered = localStorage.getItem('fasliRememberMe') === 'true';
          const Preferences = window.Capacitor?.Plugins?.Preferences;
          const persist = (key, value) => {
            sessionStorage.setItem(key, value);
            if (!isRemembered) return;
            localStorage.setItem(key, value);
            if (Preferences) Preferences.set({ key, value }).catch(() => {});
            if (window.electronStore) window.electronStore.set(key, value).catch(() => {});
          };
          persist('jwtToken', data.access_token);
          persist('refreshToken', data.refresh_token);
          return data.access_token;
        } catch (e) {
          return null;
        } finally {
          window.__fasliRefreshInFlight = null;
        }
      })();
      return window.__fasliRefreshInFlight;
    };

    window.fetch = async function (input, init) {
      const response = await originalFetch(input, init);
      try {
        const urlStr = typeof input === 'string' ? input : input?.url || '';
        const hadAuthHeader = init?.headers && (init.headers.Authorization || init.headers.authorization);
        if (response.status === 401 && urlStr.includes('/functions/v1/') && hadAuthHeader && !(init && init.__fasliRetried)) {
          const freshToken = await window.__fasliActiveRefresh();
          if (freshToken) {
            const retryInit = Object.assign({}, init, {
              __fasliRetried: true,
              headers: Object.assign({}, init.headers, { Authorization: 'Bearer ' + freshToken }),
            });
            return await originalFetch(input, retryInit);
          }
        }
      } catch (e) { /* أي خطأ هنا يتجاهل — نرجع الاستجابة الأصلية زي ما هي */ }
      return response;
    };
  } catch (e) {
    // ✅ تجاهل — لو فشل تركيب الـwrapper لأي سبب، الصفحة تفضل شغالة بسلوكها القديم
  }
})();
