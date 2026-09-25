// نافذة "قرارات الحضور" — لوحة المدرس والمساعد.
// لما طالب يمرّر كارته وهو مش تابع لمجموعة الحصة الشغّالة، السيرفر بيسجّل طلب "بانتظار قرار"
// (attendance-decisions) بدل ما يرفض. الملف ده بيعمل polling للطلبات وبيعرضها في طابور:
//   رفض | تعويض حصة فاتت (نفس المدرس) | حضور مبكر لحصة قادمة لمجموعة الطالب الأصلية.
// النافذة قابلة للتصغير لشريط بعدّاد عشان ماتعطّلش شغل المستخدم وقت الزحمة، وما بيتنفّذ أي حاجة
// للطالب (حضور/دفع) قبل القرار.
// بتعتمد على globals الصفحة: PROJECT_URL و getAuthHeaders() و showToast().
(function () {
  if (window.__fasliDecisionQueue) return;
  window.__fasliDecisionQueue = true;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let queue = [];
  let selectedId = null;
  let tab = 'makeup';
  let busy = false;
  let pollTimer = null;
  let lastSignature = '';
  let minimized = false;
  const seenIds = new Set();
  const optionsCache = {};

  async function api(body) {
    const headers = typeof getAuthHeaders === 'function' ? getAuthHeaders() : null;
    if (!headers) return null;
    const response = await fetch(PROJECT_URL + '/functions/v1/attendance-decisions', {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    return response.json().catch(() => null);
  }

  function ensureDom() {
    if (document.getElementById('dqModal')) return;
    const dock = document.createElement('button');
    dock.id = 'dqDock';
    dock.type = 'button';
    dock.className = 'dq-dock';
    dock.addEventListener('click', () => { minimized = false; openModal(); });
    document.body.appendChild(dock);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'dqModal';
    overlay.innerHTML =
      '<div class="modal-box modal-box-wide" role="dialog" aria-labelledby="dqTitle">' +
        '<div class="dq-head">' +
          '<h3 id="dqTitle">🔔 طلبات بانتظار قرارك</h3>' +
          '<div class="dq-nav">' +
            '<button type="button" class="dq-nav-btn" id="dqPrev" aria-label="السابق">›</button>' +
            '<span id="dqCounter"></span>' +
            '<button type="button" class="dq-nav-btn" id="dqNext" aria-label="التالي">‹</button>' +
          '</div>' +
          '<button type="button" class="dq-min" id="dqMin">تصغير ▾</button>' +
        '</div>' +
        '<div id="dqBody"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById('dqMin').addEventListener('click', () => { minimized = true; closeModal(); renderDock(); });
    document.getElementById('dqPrev').addEventListener('click', () => step(-1));
    document.getElementById('dqNext').addEventListener('click', () => step(1));
  }

  const isOpen = () => document.getElementById('dqModal')?.classList.contains('open');
  const otherModalOpen = () => !!document.querySelector('.modal-overlay.open:not(#dqModal)');
  const current = () => queue.find((d) => d.id === selectedId) || null;

  function openModal() {
    ensureDom();
    document.getElementById('dqModal').classList.add('open');
    renderDock();
    renderModal(true);
  }
  function closeModal() { document.getElementById('dqModal')?.classList.remove('open'); }

  function step(delta) {
    if (queue.length < 2) return;
    const i = queue.findIndex((d) => d.id === selectedId);
    selectedId = queue[(i + delta + queue.length) % queue.length].id;
    tab = 'makeup';
    renderModal(true);
  }

  function renderDock() {
    ensureDom();
    const dock = document.getElementById('dqDock');
    const show = queue.length > 0 && !isOpen();
    dock.style.display = show ? 'flex' : 'none';
    dock.innerHTML = '🔔 <span>' + queue.length + ' ' + (queue.length === 1 ? 'طلب' : 'طلبات') + ' بانتظار قرارك</span>';
  }

  function minutesLeft(d) {
    return Math.max(0, Math.ceil((new Date(d.expires_at).getTime() - Date.now()) / 60000));
  }

  async function loadOptions(id) {
    if (optionsCache[id]) return optionsCache[id];
    const res = await api({ action: 'options', decisionId: id });
    if (res && res.success) optionsCache[id] = res;
    return res;
  }

  // بيرسم النافذة. fullRender=false → بس نحدّث العدّاد من غير ما نلمس الحقول (عشان الـpolling
  // ماسحش اللي المستخدم كاتبه/مختاره)
  function renderModal(fullRender) {
    ensureDom();
    if (queue.length === 0) { closeModal(); renderDock(); return; }
    if (!current()) selectedId = queue[0].id;
    const d = current();
    const idx = queue.findIndex((x) => x.id === d.id);
    document.getElementById('dqCounter').textContent = (idx + 1) + ' من ' + queue.length;
    document.getElementById('dqPrev').disabled = document.getElementById('dqNext').disabled = queue.length < 2;
    const left = document.getElementById('dqLeft');
    if (left) left.textContent = 'ينتهي الطلب خلال ' + minutesLeft(d) + ' د';
    if (!fullRender) return;

    const body = document.getElementById('dqBody');
    body.innerHTML =
      '<div class="dq-card">' +
        '<div class="dq-student">' + esc(d.student_name || d.student_uid) + '</div>' +
        '<div class="dq-row"><span>مجموعته:</span> <b>' + esc(d.home_group_name || '—') + '</b></div>' +
        '<div class="dq-row"><span>مرّر الكارت في:</span> <b>' + esc(d.active_group_name || '—') +
          (d.active_session_label ? ' — ' + esc(d.active_session_label) : '') + '</b>' +
          (d.active_instructor_name ? ' <span class="dq-muted">(المدرس: ' + esc(d.active_instructor_name) + ')</span>' : '') + '</div>' +
        '<div class="dq-warn">الطالب مش مسجّل في المجموعة دي — ماتسجّلش له أي حاجة قبل قرارك.</div>' +
        '<div class="dq-muted" id="dqLeft">ينتهي الطلب خلال ' + minutesLeft(d) + ' د</div>' +
      '</div>' +
      '<div class="dq-tabs" role="tablist">' +
        '<button type="button" class="dq-tab' + (tab === 'makeup' ? ' active' : '') + '" data-tab="makeup">🔁 تعويض حصة فاتت</button>' +
        '<button type="button" class="dq-tab' + (tab === 'early' ? ' active' : '') + '" data-tab="early">⏩ حضور مبكر</button>' +
        '<button type="button" class="dq-tab dq-tab-reject' + (tab === 'reject' ? ' active' : '') + '" data-tab="reject">❌ رفض</button>' +
      '</div>' +
      '<div id="dqPane" class="dq-pane"><div class="dq-muted">جاري التحميل...</div></div>';
    body.querySelectorAll('.dq-tab').forEach((btn) => btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      body.querySelectorAll('.dq-tab').forEach((b) => b.classList.toggle('active', b === btn));
      renderPane();
    }));
    renderPane();
  }

  async function renderPane() {
    const pane = document.getElementById('dqPane');
    const d = current();
    if (!pane || !d) return;
    const forId = d.id;

    if (tab === 'reject') {
      pane.innerHTML = '<p class="dq-muted">هيتم رفض الكارت من غير تسجيل أي حاجة. ولو مرّر نفس الطالب تاني بعد قليل، هيترفض مباشرة من غير ما تظهر نافذة جديدة.</p>' +
        '<button type="button" class="btn btn-danger" id="dqConfirm">رفض</button>';
      document.getElementById('dqConfirm').addEventListener('click', () => resolve({ resolution: 'reject' }));
      return;
    }

    const opts = await loadOptions(forId);
    if (selectedId !== forId || !document.getElementById('dqPane')) return; // المستخدم انتقل لطلب تاني وقت التحميل
    if (!opts || !opts.success) {
      pane.innerHTML = '<div class="dq-warn">' + esc((opts && opts.message) || 'تعذر تحميل الخيارات') + '</div>';
      return;
    }
    const instructorHint = '<p class="dq-muted">التعويض بنفس المدرس فقط' + (opts.activeInstructorName ? ' (' + esc(opts.activeInstructorName) + ')' : '') + '.</p>';

    if (tab === 'makeup') {
      if (opts.pastSessions.length === 0) {
        pane.innerHTML = instructorHint + '<div class="dq-warn">مفيش حصص فاتت متاحة للتعويض لهذا الطالب (آخر 30 يوم مع نفس المدرس).</div>';
        return;
      }
      pane.innerHTML = instructorHint +
        '<label class="dq-label" for="dqPastSel">اختار الحصة اللي بيعوّضها</label>' +
        '<select id="dqPastSel" class="dq-input">' +
          opts.pastSessions.map((s) => '<option value="' + s.id + '">' + esc(s.date) + ' — ' + esc(s.label || 'حصة') + ' — ' + esc(s.groupName) + (s.wasMarkedAbsent ? ' (مسجّل غايب)' : '') + '</option>').join('') +
        '</select>' +
        '<p class="dq-muted">هيتحوّل حضوره في الحصة دي لـ"حاضر" مع ملاحظة إنه عوّض مع مجموعة ' + esc(d.active_group_name || '') + '، ويوصل إشعار مفصّل للطالب وولي الأمر.</p>' +
        '<button type="button" class="btn btn-primary" id="dqConfirm">تسجيل التعويض</button>';
      document.getElementById('dqConfirm').addEventListener('click', () => {
        resolve({ resolution: 'makeup_past', targetSessionId: Number(document.getElementById('dqPastSel').value) });
      });
      return;
    }

    // early
    pane.innerHTML = instructorHint +
      '<label class="dq-label" for="dqFutureSel">الحصة القادمة</label>' +
      '<select id="dqFutureSel" class="dq-input">' +
        opts.futureSessions.map((s) => '<option value="' + s.id + '">' + esc(s.date) + ' — ' + esc(s.label || 'حصة') + ' — ' + esc(s.groupName) + '</option>').join('') +
        '<option value="new">➕ إنشاء حصة قادمة جديدة</option>' +
      '</select>' +
      '<div id="dqNewFields" class="field-grid-2" style="margin-top:10px">' +
        '<div><label class="dq-label" for="dqNewGroup">المجموعة</label><select id="dqNewGroup" class="dq-input">' +
          opts.homeGroups.map((g) => '<option value="' + esc(g) + '">' + esc(g) + '</option>').join('') + '</select></div>' +
        '<div><label class="dq-label" for="dqNewDate">تاريخ الحصة</label><input type="date" id="dqNewDate" class="dq-input" min="' + esc(opts.today) + '" value="' + esc(opts.today) + '"></div>' +
        '<div style="grid-column:1/-1"><label class="dq-label" for="dqNewLabel">اسم الحصة</label><input type="text" id="dqNewLabel" class="dq-input" maxlength="80" placeholder="مثال: حصة الأسبوع القادم"></div>' +
      '</div>' +
      '<p class="dq-muted">هيتسجّل حضوره مقدّمًا في حصة مجموعته الأصلية، ويوصل إشعار مفصّل للطالب وولي الأمر.</p>' +
      '<button type="button" class="btn btn-primary" id="dqConfirm">تسجيل الحضور المبكر</button>';
    const sel = document.getElementById('dqFutureSel');
    const newFields = document.getElementById('dqNewFields');
    if (opts.futureSessions.length > 0) sel.value = String(opts.futureSessions[0].id); else sel.value = 'new';
    const syncNew = () => { newFields.style.display = sel.value === 'new' ? '' : 'none'; };
    sel.addEventListener('change', syncNew);
    syncNew();
    document.getElementById('dqConfirm').addEventListener('click', () => {
      if (sel.value === 'new') {
        resolve({
          resolution: 'early_future',
          newSession: {
            groupName: document.getElementById('dqNewGroup').value,
            sessionDate: document.getElementById('dqNewDate').value,
            sessionLabel: document.getElementById('dqNewLabel').value.trim(),
          },
        });
      } else {
        resolve({ resolution: 'early_future', targetSessionId: Number(sel.value) });
      }
    });
  }

  async function resolve(payload) {
    const d = current();
    if (!d || busy) return;
    busy = true;
    const btn = document.getElementById('dqConfirm');
    if (btn) btn.disabled = true;
    try {
      const res = await api({ action: 'resolve', decisionId: d.id, ...payload });
      if (typeof showToast === 'function') showToast(res ? (res.success ? '✅ ' : '❌ ') + res.message.replace(/^[✅⚠️⛔⏱ ]+/u, '') : '❌ تعذر الاتصال', res && res.success ? 'success' : 'error');
      // نجاح، أو الطلب اتحسم/انتهى (409): بيخرج من الطابور. أي خطأ تاني بيفضل عشان يحاول تاني
      if (res && (res.success || /انتهى أو اتحسم/.test(res.message || ''))) {
        queue = queue.filter((x) => x.id !== d.id);
        selectedId = queue.length ? queue[0].id : null;
        tab = 'makeup';
        lastSignature = queue.map((x) => x.id).join(',');
        renderModal(true);
        renderDock();
        poll(true);
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast('❌ تعذر الاتصال', 'error');
    } finally {
      busy = false;
      const again = document.getElementById('dqConfirm');
      if (again) again.disabled = false;
    }
  }

  function applyQueue(list) {
    let hasNew = false;
    (list || []).forEach((d) => { if (!seenIds.has(d.id)) { seenIds.add(d.id); hasNew = true; } });
    queue = list || [];
    const signature = queue.map((d) => d.id).join(',');
    const changed = signature !== lastSignature;
    lastSignature = signature;
    if (queue.length === 0) { closeModal(); renderDock(); return; }
    if (!current()) { selectedId = queue[0].id; tab = 'makeup'; }
    renderDock();
    if (isOpen()) {
      // الطابور اتغيّر (طلب جديد/اتحسم من مساعد تاني)، والطلب الحالي لسه موجود: بنحدّث العدّاد بس
      // عشان مانمسحش اللي المستخدم بيكتبه. لو الحالي اختفى، renderModal فوق اختار غيره وبيرسم كامل
      renderModal(false);
    } else if (hasNew && !otherModalOpen()) {
      minimized = false;
      openModal();
    }
    if (changed && isOpen() && !document.getElementById('dqPane')) renderModal(true);
  }

  async function poll(immediate) {
    clearTimeout(pollTimer);
    try {
      if (!document.hidden || immediate === true) {
        const res = await api({ action: 'list' });
        if (res && res.success) applyQueue(res.data);
      }
    } catch (e) { /* الشبكة/الجلسة: نحاول في الدورة الجاية */ }
    // أسرع طول ما القارئ شغّال (الطلبات بتظهر في ثواني)، وأبطأ كتير لما مفيش وضع مفعّل
    pollTimer = setTimeout(poll, window.__fasliCardModeActive ? 3000 : 30000);
  }

  function start() {
    ensureDom();
    poll(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
