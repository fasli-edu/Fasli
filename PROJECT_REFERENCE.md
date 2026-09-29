# فَصلي (Fasli) — مرجع المشروع الشامل

> **الغرض من هذا الملف:** مرجع تقني كامل ودقيق لمشروع "فَصلي" يُرسَل لجلسة عمل جديدة (Claude أو غيره) لإعطائها كل السياق اللازم للتطوير، بلا حاجة لإعادة شرح البنية أو القرارات المعمارية من الصفر. آخر تحديث: **2026-09-29**. المُعِدّ: Claude (Sonnet 5) بالتعاون مع صاحب المشروع خلال جلسات عمل متتالية.
>
> **كيفية الاستخدام:** هذا الملف يوثّق "الحالة الحالية" (current state) وأهم "القرارات وأسبابها" (لماذا الأمور مبنية هكذا)، وليس سجل كل تغيير تاريخي. عند التطوير المستقبلي، اقرأ القسم المناسب ثم تحقق من الكود الفعلي (قد يتغيّر بعد كتابة هذا الملف) قبل الاعتماد الكامل على أي تفصيلة هنا.

---

## 1. نظرة عامة

**فَصلي** نظام SaaS لإدارة المدارس/السناتر التعليمية الخاصة (دروس خصوصية، سناتر تقوية) في مصر، بالعربية بالكامل (واجهة RTL). يخدم خمسة أدوار: **مشرف النظام (Fasli-admin)**، **مدرس**، **مساعد المدرس**، **ولي أمر**، **طالب**. يشمل: إدارة طلاب/مجموعات، حضور وغياب (يدوي وبكارت RFID فعلي عبر جهاز ESP32)، مدفوعات ومذكرات، درجات واختبارات إلكترونية، رسائل ومحادثات، تقارير، نظام "سنتر" (مدرس رئيسي يشرف على عدة "أسماء مدرسين" فرعيين ومجموعات).

### التقنيات
- **الواجهة الأمامية:** HTML/CSS/JS خام (بدون framework)، صفحة واحدة لكل شاشة (multi-page app)، عربي RTL بالكامل. منشورة كـ GitHub Pages (ثابتة بالكامل).
- **الخلفية:** Supabase (PostgreSQL + Edge Functions بـ Deno/TypeScript). لا يوجد سيرفر Node.js منفصل — كل منطق الأعمال في Edge Functions.
- **المصادقة:** Supabase Auth (تمت الهجرة إليه من نظام JWT مخصص — انظر القسم 5).
- **الجهاز الفعلي:** ESP32 + قارئ RFID (MFRC522)، كود Arduino في `Fasli-T/Fasli-T.ino`.
- **الإشعارات:** Firebase Cloud Messaging (Push) + إشعارات داخل التطبيق (جدول `notifications`).
- **البريد:** Gmail SMTP لاسترجاع كلمة المرور وتأكيد إيميل الاسترجاع (ليس Resend — تم التحول عنه لعدم الحاجة لدومين موثّق).

### مشروع Supabase الحالي
- **المشروع:** `ugvuwiaemrrtwplphkdn` (URL: `https://ugvuwiaemrrtwplphkdn.supabase.co`).
- ⚠️ هذا **مشروع جديد بالكامل** حل محل مشروع قديم (`yxkyxxzcnxpxefodfxnl`) بعد إعادة هيكلة كاملة. أي جهاز فعلي قديم مبرمج بالرابط/المفتاح القديم لن يعمل ويحتاج إعادة فلاش.
- النشر عبر: `npx supabase@latest functions deploy <name> --project-ref ugvuwiaemrrtwplphkdn` مع `SUPABASE_ACCESS_TOKEN` (Personal Access Token من Supabase Dashboard، ينتهي صلاحيته أحيانًا ويحتاج تجديدًا من المستخدم).

### مستودع Git والنشر
- **الريموت `origin`:** `https://github.com/fasli-edu/Fasli.git` (الحالي). يوجد أيضًا `old-origin` (`Fasli-EG/Fasli.git`) من مرحلة سابقة، غير مستخدَم حاليًا.
- **الفروع الثلاثة:**
  - **`master`** — فرع العمل الرئيسي، يحتوي الكود الكامل (frontend + supabase + firmware).
  - **`deploy-sync`** و **`main`** — فروع GitHub Pages (الموقع المنشور فعليًا للمستخدمين). هذان الفرعان **مسطّحان** (flat): ملفات `frontend/*` موجودة في **جذر** الفرع مباشرة (بدون مجلد `frontend/`)، بعكس `master` حيث كل شيء تحت `frontend/`.
  - **آلية النشر اليدوية المتبعة طوال الجلسات:** بعد أي تعديل في `frontend/` على `master` ودفعه، يُنسخ كل ملف واجهة معدَّل بأمر مثل:
    ```bash
    git worktree add --detach /tmp/wt_deploy-sync origin/deploy-sync
    git show <master-commit>:frontend/<file> > /tmp/wt_deploy-sync/<file>
    cd /tmp/wt_deploy-sync && git add -A && git commit -m "Mirror master: ..." && git push origin HEAD:deploy-sync
    git worktree remove --force /tmp/wt_deploy-sync
    ```
    يُكرَّر نفس الشيء لفرع `main`. **لا توجد أتمتة (CI/CD) لهذا** — كل نشرة تمّت يدويًا خلال الجلسات. أي تعديل مستقبلي على `frontend/` يجب تذكّر نسخه لهذين الفرعين وإلا لن يظهر للمستخدمين فعليًا.
- **Edge Functions لا تُنسخ لأي فرع خاص** — تُنشر مباشرة من `master` (أو أي checkout) عبر Supabase CLI، فور كتابتها، بغض النظر عن حالة الفروع الأخرى.
- **تعليمة الـcommit:** جميع الرسائل تنتهي بـ `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

### التوليف/التحقق (لا يوجد build step)
- الواجهة HTML/JS/CSS خام — لا bundler ولا TypeScript على الواجهة.
- Edge Functions تُفحص محليًا بـ `deno check <file>.ts` قبل النشر (Deno مثبَّت في بيئة العمل: `~/.deno/bin/deno`).
- لا توجد بيئة CI رسمية؛ الاختبار يتم عبر **سكربتات Node.js مؤقتة في مجلد scratchpad** تنشئ حسابات مدرّس تجريبية حقيقية عبر الـAPI المباشر، وتُحذف تلقائيًا في نهاية كل اختبار (انظر القسم 9 "منهجية الاختبار").
- `.claude/launch.json` يعرّف سيرفرات معاينة محلية (`frontend-static` على منفذ 8834 يقدّم `frontend/` مباشرة، و`vite-dist-preview`)، تُستخدم مع Claude Code Browser لمعاينة التغييرات.

---

## 2. بنية قاعدة البيانات (PostgreSQL)

لا يوجد ملف `pg_dump` حقيقي — أول migration (`20250101000000_baseline_schema.sql`) أُعيد بناؤها يدويًا من قراءة الكود الفعلي (كل الجداول بصيغة `create table if not exists`، آمنة على أي قاعدة بيانات فيها الجداول أصلًا). كل الترحيلات (migrations) بعدها حقيقية بالترتيب الزمني في `supabase/migrations/*.sql` (38 ملفًا حتى تاريخ هذا الملف).

⚠️ **قيد بنيوي مهم:** لا يمكن لأي جلسة عمل تنفيذ DDL (إنشاء/تعديل جداول) مباشرة على قاعدة بيانات الإنتاج — الأداة المتاحة محظور عليها ذلك من طبقة تصنيف الأوامر. **كل migration جديدة تُكتَب كملف SQL ويُطلب من المستخدم تنفيذها يدويًا عبر Supabase Dashboard → SQL Editor.** الكود الذي يعتمد على عمود/جدول جديد **لا يُنشر إلا بعد تأكيد المستخدم** أن الـmigration نُفِّذت، حتى لا ينكسر النظام الحي بالإشارة لعمود غير موجود.

### 2.1 الجداول الجذرية

| الجدول | المفتاح الأساسي | ملاحظات |
|---|---|---|
| `teachers` | `client_id` (نص، ليس UUID) | صف واحد لكل مدرس **وأيضًا لحساب المشرف** (`client_id = 'Fasli-admin'`، صف عادي بعلامات خاصة في الكود). أعمدة رئيسية: `is_active`, `expiry_date` (الترخيص), `max_students`, `student_count`, `device_secret` (سر جهاز RFID), `is_center` + `center_id`, `permissions` (jsonb — صلاحيات الباقة، انظر 6.3), `center_sharing_permissions`, `contact_phone/whatsapp` + `phone_visible/whatsapp_visible`, `conversations_enabled`, `registration_token`, `brand_logo_url`/`brand_color` (تخصيص الهوية)، `electronic_payment_enabled` + `payment_instapay`/`payment_wallet`/`payment_bank_details`، `auth_user_id` (uuid — ربط بـ Supabase Auth)، `recovery_email` + `recovery_email_verified`، `absence_threshold_minutes` (افتراضي 30), `notes`. |
| `centers` | `id` (bigint identity) | كيان "السنتر" ذاته (منفصل عن `teachers.is_center`!). ⚠️ **لا يوجد FK فعلي** بين `teachers.center_id` و`centers.id` عمدًا (كلاهما `create table if not exists`، فأي `ALTER` خارجي قد يفشل على بيانات إنتاج غير متسقة). التكامل مُدار بالكامل من منطق التطبيق، ليس من قاعدة البيانات. |
| `parents` | `phone` (نص) | حساب ولي الأمر، مفتاحه رقم الهاتف مباشرة. |
| `students` | `id` (identity) + `uid` **unique** | `uid` هو المعرّف العملي (يُستخدم لتسجيل الدخول وربط كل الجداول الأخرى، ليس `id`). `group_name` نصي مباشر (ليس FK لجدول `groups` — انظر تحذير أدناه)، `archived_at` (أرشفة الطالب بدل حذفه). |

⚠️ **تحذير معماري مهم جدًا:** `students.group_name`, `attendance.group_name`, `payments.group_name`, إلخ — كلها **نصوص حرة (denormalized)**، وليست Foreign Keys لجدول `groups`. لا يوجد قيد قاعدة بيانات يمنع عدم تطابق الاسم. **تغيير اسم مجموعة (`manage-group action=rename`) يتطلب تحديث كل الجداول المرجعية يدويًا في نفس الدالة** — إن أُضيف جدول جديد يشير لاسم مجموعة، يجب تذكّر تحديثه في منطق إعادة التسمية والحذف.

### 2.2 المجموعات والسنتر

- `education_levels`, `instructor_names` — كيانات خاصة بحسابات السنتر (المرحلة الدراسية، و"اسم المدرس الفرعي" التابع للسنتر — **ليس** له حساب دخول مستقل، هو مجرد اسم/تصنيف).
- `groups` — `(teacher_id, name)` **unique**. مرتبطة اختياريًا بـ `level_id` و`instructor_name_id`. `max_students` اختياري (يُفعّل قائمة انتظار تلقائية عند تسجيل طلب انضمام عام لمجموعة ممتلئة).
- `student_group_links` — **مجموعات ثانوية**: طالب أساسي في مجموعة X، لكن مربوط أيضًا بمجموعة Y (تعدد مواد/مدرسين). `unique(student_uid, group_name)`. يُستخدم في: حساب الغياب (`check-session-absences` يجمع الأساسيين + الثانويين)، سجل الحصة (`rosterForSession`)، وفحص "هل الطالب تابع لهذه المجموعة" في نظام المسارات (انظر القسم 7).
- `student_teacher_links` — لربط طالب بمدرس آخر تابع لنفس السنتر (`linked_by_center_id`).

### 2.3 كروت RFID والقارئ

- `system_cards` — المخزون المركزي للكروت الفعلية. `card_uid` **unique**. `status` (`unassigned`/`in_stock`/إلخ)، `center_id` أو `teacher_id` (الكارت يخص سنترًا كاملًا أو مدرسًا فردًا)، `student_uid` (بعد الربط)، `is_active`.
- `pending_card_registrations` — **صف واحد لكل مدرس** (`unique(teacher_id)` — أُضيف متأخرًا في migration `20260921000001` بعد اكتشاف أن الكود كان يفترض هذا القيد منذ البداية بدون أن يوجد فعليًا، مما كان يسبب فشل 500 صامتًا). يمثّل "وضع انتظار مسح كارت" (لتسجيل طالب جديد أو ربط كارت بطالب موجود). ⚠️ **الصف لا يُحذف بعد اكتمال العملية — يُحدَّث (`registered_card_uid` يُملأ)**. أي كود يفحص "هل يوجد طلب تسجيل معلّق فعليًا" **يجب** أن يضيف `.is("registered_card_uid", null)` وإلا سيطابق طلبات قديمة مكتملة (كان هذا خطأ فعليًا مُصلَحًا، انظر القسم 9.1).
- `card_action_mode` — **الوضع القديم (سياق واحد لكل مدرس)**، ما زال يعمل للمدرس المنفرد. مفتاحه `teacher_id` نفسه (primary key). انظر القسم 7 للتفصيل الكامل.
- `card_mode_lanes` — **نظام "المسارات" الجديد** (متعدد لكل حساب سنتر). انظر القسم 7.
- `master_device` / `master_scan_mode` — جهاز/وضع "الماستر" المستخدَم من الأدمن لمسح كروت جديدة إلى المخزون (منفصل تمامًا عن أجهزة المدرسين).
- `rfid_scans` — سجل خام لكل مسحة (تسجيل فقط، دون تأثير وظيفي مباشر إلا في السجل).
- `card_scan_locks` — أقفال قصيرة العمر (30 ثانية) لمنع تنفيذ نفس عملية الدفع/سداد المذكرة مرتين عند مسحات متزامنة لنفس الكارت (انظر القسم 8).

### 2.4 المالية

- `payment_titles` — بنود الاشتراك المعرَّفة لكل مدرس (`unique(teacher_id, title)`).
- `payments` — دفعة **مؤكدة فعليًا**. `amount` (المدفوع الآن) مقابل `total_amount` (السعر الكامل) — الفرق بينهما = دفعة جزئية.
- `books` / `book_payments` — المذكرات وسداداتها، نفس منطق `payments` (`amount` جزئي مقابل `price` كامل).
- `payment_receipts` — **مسار منفصل تمامًا عن `payments`**: ولي الأمر يرفع صورة إيصال تحويل (InstaPay/محفظة) والمدرس يراجعها ويقبل/يرفض (`status: pending/approved/rejected`). لماذا منفصل: أي صف في `payments` يُعتبر في كل الكود الحالي "دفعة مؤكدة فعليًا" ويُطلق إشعارات فورية — خلط حالة "معلّقة" فيه كان سيغيّر سلوك كل مكان يقرأ من `payments`. bucket تخزين خاص (`payment-receipts`, `public: false`) لأن الإيصالات قد تحوي تفاصيل حساب بنكي.
- `expenses` — مصروفات المدرس (تقرير الدخل الشهري `financial.html` يطرحها من الإيرادات).

### 2.5 الدرجات والاختبارات الإلكترونية

- `grades` — درجات يدوية بسيطة (اختبار ورقي).
- `online_exams` + `exam_questions` (mcq بخيارات jsonb، أو صورة سؤال `question_image_url`) + `exam_target_students` (استهداف طلاب معيّنين) + `exam_attempts` (`mode: official|practice` — وضع تدريب لا يُحتسب في الدرجات) + `exam_answers`.
- `exam_titles` — عناوين اختبارات ورقية (منفصلة عن `online_exams`).

### 2.6 الحضور (الجزء الأكثر تطورًا وتعقيدًا في النظام — انظر القسم 7 كاملًا)

- `attendance_sessions` — "الحصة اليومية" (نظام حديث حل محل نظام حصص أسبوعية متكررة قديم بالكامل — لا أثر له في الكود الحالي). كل حصة تُنشأ فعليًا لحظة أول تسجيل حضور (قارئ أو يدوي)، مرتبطة بـ`session_date`. أعمدة إضافية حديثة: `ended_at` (إنهاء يدوي قبل الوقت الطبيعي)، `scheduled_only` (حصة مستقبلية أُنشئت مسبقًا لحضور مبكر، لم تُفتح فعليًا بعد — فحص الغياب يتجاهلها).
- `attendance` — صف حضور/غياب واحد لكل (طالب + حصة). أعمدة التعويض الحديثة: `is_makeup`, `makeup_type` (`past`/`early`), `attended_via_group`, `attended_via_session_id` (الحصة التي حضرها فعليًا، بينما الصف نفسه يبقى تابعًا لحصته/مجموعته الأصلية).
- `pending_attendance_decisions` — طابور "قرارات الحضور" (نظام حديث جدًا — القسم 7.4).

### 2.7 الرسائل والإشعارات

- `notifications` — إشعار داخل التطبيق. `audience` (`parent`/`student`/`teacher`) يحدد المستلم، مع `CHECK constraint` (`notifications_recipient_check`) يضمن وجود المعرّف المناسب (`parent_phone`/`assistant_id`/`student_uid` حسب `audience`، أو `teacher_id` مع `audience='teacher'` أو `type='center_teacher_message'`).
- `push_tokens` — رموز Firebase FCM، `unique(recipient_type, recipient_id, token)`.
- `conversation_messages` — محادثة مدرس/مساعد ↔ ولي أمر (الـ"thread" الضمني = `(teacher_id, student_uid, parent_phone)`).
- `assistant_messages` — محادثة مدرس ↔ مساعد (نفس بنية `conversation_messages`، الـ"thread" = `(teacher_id, assistant_id)`).
- `registration_requests` — طلبات انضمام عامة (رابط تسجيل عام + QR، بلا تسجيل دخول)، تُراجَع وتُقبَل/تُرفَض من المدرس.

### 2.8 الأمان والتدقيق

- `login_attempts` — حماية من التخمين المتكرر. **الكتابة تتم عبر دالة SQL ذرّية `register_login_attempt`** (وليس SELECT ثم UPSERT من الكود) — أُصلح لاحقًا (`20260918000001`) بعد اكتشاف أن النسخة القديمة غير ذرّية كانت تسمح بتجاوز الحد الأقصى (5 محاولات) عبر طلبات متزامنة (هجوم موازٍ).
- `activity_logs` — سجل كل عملية (إضافة/تعديل/حذف) مع `performer_id/role/name` (مين نفّذ فعليًا: مدرس أو مساعد محدد) و`details` (jsonb).
- `webauthn_credentials` / `webauthn_challenges` — الدخول بالبصمة/الوجه (Passkeys)، موحّد لكل الأدوار، مرتبط بـ`auth_user_id` (uuid حقيقي) لا بمعرّف العمل، حتى يبقى صالحًا لو تغيّر المعرّف لاحقًا.
- `password_reset_tokens` — استرجاع كلمة مرور بإيميل، توكن لمرة واحدة صالح لساعة.
- `recovery_email_codes` — رمز تأكيد من 6 أرقام لإيميل الاسترجاع، **إجباري لأول دخول لأي حساب جديد** (الحسابات القديمة قبل هذا التحديث `recovery_email_verified = true` تلقائيًا للتوافق).

### 2.9 المحتوى وإعدادات النظام

- `system_settings` — صف واحد (`id=1` بقيد `CHECK`)، إعدادات عامة (تواصل، Firebase، بانرات البوابة لكل دور، رابط تنزيل التطبيق...). **لا توجد أي RLS policy له عمدًا** — القراءة العامة تمر حصرًا عبر دالة `get-system-settings` (بصلاحيات service_role) التي تُرجع الحقول العامة فقط.
- `login_ads` / `portal_banners` / `photo_albums` + `photo_album_images` — محتوى تسويقي/إعلاني في صفحة الدخول والبوابات.

### 2.10 نمط RLS المتّبع في كل المشروع

**كل الجداول تقريبًا: `alter table X enable row level security;` بدون أي `create policy`.** هذا يعني رفضًا افتراضيًا كاملًا لأي وصول من `anon`/`authenticated` مباشرة على الجدول. **كل الوصول الفعلي يمر عبر Edge Functions بمفتاح `service_role`** (الذي يتخطى RLS دائمًا)، والتحقق من الصلاحية/الملكية يتم **في كود التطبيق (TypeScript)** داخل كل دالة، وليس في قاعدة البيانات. هذا نمط متعمَّد ومتّسق — أي جدول جديد يجب أن يتبع نفس النمط (RLS مفعّل بلا policies) ما لم يكن هناك سبب صريح لغير ذلك.

---

## 3. بنية Edge Functions (`supabase/functions/`)

**97 دالة** (حتى تاريخ هذا الملف)، كل دالة في مجلد خاص بها `<name>/index.ts`. لا يوجد استيراد بين الدوال (Supabase Dashboard/CLI لا يدعم استيرادًا نسبيًا بين دوال منفصلة بسهولة) — **أي كود مشترك يُدمَج نسخًا حرفيًا داخل كل دالة تحتاجه** (مثال: منطق إرسال Push عبر Firebase مُكرَّر حرفيًا في أكثر من دالة، معلَّم بتعليق `(من _shared/push.ts — مدموج مباشرة لأن Dashboard لا يدعم الاستيراد بين الدوال)`). الاستثناء الوحيد: `supabase/functions/_shared/auth.ts` — **هذا فعليًا يُستورَد** عبر مسار نسبي `../_shared/auth.ts` من كل دالة تقريبًا (لأنه في نفس مجلد `functions/` القابل للنشر معًا).

### 3.1 `_shared/auth.ts` — الوحدة المركزية (اقرأها أولًا قبل أي تعديل مصادقة)

الدوال المصدَّرة الأساسية:
- **`verifyToken(req, opts?)`** — نقطة العبور الوحيدة للتحقق من هوية أي طلب مستخدم عادي (غير جهاز RFID). تتحقق من توكن Supabase Auth الحقيقي عبر `supabase.auth.getUser(token)`، ثم تقرأ بيانات الدور (`role`/`clientId`/`sub`/...) من **`app_metadata`** لمستخدم Supabase (ليس من الـclaims العلوية). **تتحقق أيضًا تلقائيًا من**: (أ) أن المساعد لم يُعطَّل (`assistants.is_active`) — نقطة تحقق وحيدة لكل الدوال، (ب) أن ترخيص المدرس (أو مدرس المساعد) لم ينتهِ (`teachers.is_active` و`expiry_date`)، إلا لو مُرِّر `skipLicenseCheck: true`. ترمي `AuthError` بأكواد HTTP مناسبة (401 توكن، 402 + `code: "LICENSE_EXPIRED"` لانتهاء الترخيص، 403 لتعطيل المساعد).
- **`ownerClientId(payload)`** — يرجّع `clientId || teacherId` (معرّف "المدرس المالك" سواء كان الطالب مدرسًا أو مساعده).
- **`requireOwnClientId`**, **`requireAdmin`**, **`requireParentPhone`** — تحققات ملكية/دور.
- **`requireTeacherPlanPermission(clientId, permKey)`** — صلاحيات **الباقة** (يحددها الأدمن للمدرس، مخزَّنة في `teachers.permissions` jsonb). المفاتيح الفعلية المستخدَمة حاليًا: `can_manage_students`, `can_manage_groups`, `can_manage_grades`, `can_manage_payments`, `can_manage_books`, `can_manage_assistants`, `can_send_messages`, `can_use_rfid`, `can_view_financial`, `can_view_reports`. **إن لم يوجد المفتاح في الـjson (مدرس قديم قبل إضافة الميزة)، الافتراض هو السماح** (توافق رجعي).
- **`requireAssistantPermission(payload, permKey)`** — صلاحيات **المساعد الفردية** (يمنحها المدرس نفسه، مخزَّنة في `assistants.permissions`). **لا تأثير على المدرس نفسه إطلاقًا** (يُسمح له دائمًا). القائمة الكاملة لمفاتيح صلاحيات المساعد (من `manage-assistant/index.ts`، الافتراضي عند الإنشاء): `view_students, add_students, edit_students, delete_students, record_grades, record_payments, view_reports, manage_attendance, manage_groups, reset_parent_password, manage_books, send_messages, manage_conversations, manage_exams, view_financial, view_activity_log, view_staff, add_staff, edit_staff, delete_staff` + **`manage_card_mode`** (أُضيفت لاحقًا لنظام الكارت).
- **`verifyDeviceSecret(clientId, deviceSecret)`** — بديل التوكن العادي **لجهاز RFID فقط** (لا تسجيل دخول له). يتحقق من `teachers.device_secret` + حالة الترخيص.
- **`safeErrorMessage(error, fallback?)`** — ينظّف رسائل خطأ قاعدة البيانات قبل عرضها للمستخدم (يرفض رسائل طويلة > 300 حرف أو تحتوي HTML — حماية من تسريب صفحات خطأ WAF/بنية تحتية كاملة كرسالة خطأ).
- **`corsHeaders`** — ثابت لكل الدوال، `Access-Control-Allow-Origin: https://fasli-edu.github.io` (**محدَّد بدومين واحد فقط**، ليس `*`).

### 3.2 نمط "الدالة الموحَّدة" (Consolidated Function Pattern)

معظم الدوال الحديثة (أكثر من 20 دالة) تجمع عدة عمليات قديمة منفصلة في دالة واحدة بمعامل `action` (مثال: `manage-student` = `add-student` + `update-student` + `delete-student` القديمة). **السبب المعلَن في الكود:** تقليل عدد الدوال المنشورة والحد من تكرار كود التحقق من الهوية/الصلاحية. **النمط القياسي لأي دالة جديدة يجب أن يتبع نفس الشكل**: `const { action } = body; if (action === "x") return await handleX(...); if (action === "y") ...`. أمثلة: `manage-group` (`create|rename|delete|assignInstructor|linkStudentToGroup|...`)، `manage-payment`, `manage-grade`, `manage-book`, `manage-book-payment`, `manage-exam`, `manage-assistant`, `manage-backup` (`export|restore`)، `manage-master-scan`, `manage-system-cards`, `manage-login-ad`, `manage-password-reset`, `card-action-mode` (`get|set|setLane|removeLane`)، `attendance-decisions` (`list|options|resolve`)، `manage-group-sessions` (`create|listToday|updateThreshold|history|rosterForSession|delete|endNow`).

### 3.3 فئات الدوال بحسب الغرض

**المصادقة والحسابات:**
`login` (دخول موحَّد لكل الأدوار — يكتشف الدور تلقائيًا)، `change-password`, `request-password-reset` / `confirm-password-reset` (الذاتي بإيميل)، `manage-password-reset` (استرجاع بواسطة المدرس/الأدمن لمساعد/ولي أمر)، `manage-recovery-email`, كل دوال `webauthn-*` (5 دوال: register-options/verify، login-options/verify، list/delete-credential)، `bootstrap-master-admin` و`fix-master-admin-metadata` (⚠️ **دوال لمرة واحدة، مذكور صراحة في الكود أنها يجب أن تُحذف بعد الاستخدام** — تحقق إن كانت ما زالت موجودة فهي على الأرجح باقية من التأسيس ولم تُحذف).

**الأدمن (Fasli-admin فقط):** `admin-manage-teacher` (إضافة/تعديل/حذف مدرس)، `admin-get-teacher(s)`, `admin-get-students-for-teacher`, `admin-regenerate-device-secret`, `admin-manage-card-registration`, `list-system-cards`, `manage-system-cards`, `manage-center`, `manage-master-scan`, `submit-master-card-scan`, `get-master-device-secret`, `manage-login-ad`, `update-admin-profile`, `update-system-settings`.

**المدرس/المساعد — الأكاديمي:** `manage-student`, `manage-group`, `manage-instructor-names`, `manage-levels`, `bulk-import-students`, `transfer-student`, `get-students`, `get-groups`, `check-student-uid`, `get-dashboard`.

**الحضور (الأكثر تعقيدًا):** `record-attendance`, `manage-group-sessions`, `check-session-absences`, `card-action-mode`, `attendance-decisions`, `submit-rfid-scan`, `manage-card-registration`, `teacher-start-new-student-scan`, `teacher-list-my-cards`, `get-latest-rfid-scan`, `get-today-attendance`.

**المالية:** `manage-payment`, `manage-book`, `manage-book-payment`, `manage-payment-receipt`, `manage-expense`, `create-payment-title`, `get-payment-titles`/`get-payments`/`get-books`/`get-book-payment`/`get-book-status`, `get-financial-summary`, `upload-book-file`.

**الدرجات/الاختبارات:** `manage-grade`, `create-exam-title`, `manage-exam`, `take-exam`, `check-scheduled-exams`, `get-exams`/`get-exams-for-student`/`get-exam-report`/`get-grades`/`get-titles`.

**الرسائل والإشعارات:** `send-bulk-message`, `manage-push-token`, `get-notifications`, `mark-notification-read`.

**التقارير والتحليل:** `generate-report`, `get-at-risk-students` (نظام إنذار مبكر تحليلي)، `check-at-risk-alerts` (نسخة استباقية تدفع إشعارات بدل انتظار فتح التقرير)، `get-activity-logs`/`delete-activity-log`.

**فريق العمل:** `manage-assistant`, `get-assistants`.

**عامة (بدون توكن):** `get-system-settings`, `get-login-ads`, `submit-registration-request`, `manage-registration-requests` (مراجعة المدرس)، `get-teacher-contact`, `update-teacher-contact`, `get-parent-children`, `get-student-full-profile`.

**إدارية/طوارئ:** `manage-backup` (تصدير/استيراد نسخة احتياطية لمدرس كامل)، `reset-system` (**أخطر دالة في النظام** — تمسح كل بيانات المدرس)، `get-device-secret`.

### 3.4 أنماط تسمية وأخطاء متكررة تم إصلاحها (تجنّبها في كود جديد)

- **مفتاح `onConflict` بدون `unique constraint` فعلي** — سبَّب فشل 500 صامتًا مرتين (`pending_card_registrations`, وسابقًا `master_device`/`master_scan_mode`). **عند كتابة `upsert(...).onConflict("col")`، تأكد أولًا من وجود `unique`/`primary key` حقيقي على `col` في قاعدة البيانات.**
- **فحص "هل يوجد طلب معلّق" ناقص فلتر الحالة** — أي جدول له صف "معلّق" يُحدَّث لا يُحذف بعد الاكتمال (`pending_card_registrations`, `pending_attendance_decisions`) يجب أن يُفلتر صراحة بعمود الحالة (`registered_card_uid is null`, `status = 'pending'`) وليس فقط بوجود صف.
- **قراءة ثم كتابة غير ذرّية** لعدّاد/حالة مشتركة تحت تزامن (كان في `login_attempts`) — استخدم `INSERT ... ON CONFLICT DO UPDATE` ذرّيًا أو دالة SQL، لا `SELECT` ثم `UPDATE` منفصلين.
- **نداء دالة لدالة أخرى داخليًا** (مثال: `manage-group-sessions` ينادي `check-session-absences` عند `endNow`) يحتاج **كلا الترويستين معًا**: `Authorization` (توكن المستخدم الممرَّر) **و** `apikey` (باستخدام `Deno.env.get("SUPABASE_ANON_KEY")`).

---

## 4. بنية الواجهة الأمامية (`frontend/`)

### 4.1 الصفحات (22 صفحة HTML)

| الملف | الدور المستهدَف | الغرض |
|---|---|---|
| `login.html` | الكل | دخول موحَّد (حقل واحد يكتشف الدور تلقائيًا)، دخول سريع (بصمة)، نسيت كلمة المرور |
| `dashboard.html` | مدرس | اللوحة الرئيسية — أكبر ملف في المشروع، يضم مودال "وضع الكارت" وعناصر تحكم كثيرة |
| `assistant-dashboard.html` | مساعد | نفس دور `dashboard.html` لكن بواجهة مصفّاة حسب الصلاحيات الممنوحة |
| `parent-dashboard.html` | ولي أمر | نظرة عامة على أبنائه |
| `student-portal.html` | طالب | "صفحتي" — حضور، درجات، اختبارات، مدفوعات |
| `admin-teachers.html` | الأدمن | إدارة كل المدرسين، إعدادات النظام العامة |
| `students.html` / `student-details.html` | مدرس/مساعد | إدارة الطلاب / تقرير طالب واحد |
| `parent-student-details.html` | ولي أمر | تفاصيل ابنه |
| `groups.html` | مدرس/مساعد | المجموعات، الحصص اليومية وسجلها، تسجيل الطلاب (رابط + QR)، مشاركة السنتر |
| `grades.html` | مدرس/مساعد | الدرجات والاختبارات |
| `take-exam.html` | طالب | أداء اختبار إلكتروني |
| `payments.html` | مدرس/مساعد | المدفوعات والمذكرات، مراجعة إيصالات الدفع الإلكتروني |
| `financial.html` | مدرس (مقيَّد) | الدخل الشهري (إيرادات - مصروفات) |
| `reports.html` | مدرس/مساعد | تقارير شاملة |
| `activity-log.html` | مدرس (مقيَّد) | سجل كل العمليات |
| `staff.html` | مدرس (مقيَّد) | إدارة المساعدين وصلاحياتهم |
| `teacher-settings.html` | مدرس | إعدادات الحساب (اسم، هوية بصرية، إيميل استرجاع، دخول سريع) |
| `messages.html` | مدرس/مساعد | رسائل جماعية لأولياء الأمور |
| `register.html` | عام (بدون دخول) | نموذج طلب انضمام عام (رابط + QR لكل مدرس) |
| `change-password.html` | الكل | إجباري عند أول دخول |
| `verify-recovery-email.html` | الكل | تأكيد رمز إيميل الاسترجاع (إجباري لأول دخول لحساب جديد) |
| `license-locked.html` | مدرس/مساعد | صفحة قفل عند انتهاء الترخيص/التعطيل |

### 4.2 ملفات JS المشتركة (يجب فهمها قبل أي تعديل واجهة)

- **`session-restore.js`** — **يجب تحميله مبكرًا في `<head>`** قبل أي كود آخر؛ ينسخ بيانات الجلسة من `localStorage` إلى `sessionStorage` عند "تذكرني". بدونه: قفل/تسجيل خروج غير متوقَّع.
- **`session-refresh.js`** — تجديد تلقائي لتوكن Supabase Auth في الخلفية (توكن Supabase الافتراضي صالح ساعة واحدة فقط، بينما النظام القديم كان يمنح 7 أيام — بدون هذا الملف، تنقطع الجلسة فجأة بعد ساعة).
- **`layout.js`** — يبني الشريط الجانبي (`sidebar`) ديناميكيًا عبر `NAV_SECTIONS` (مصفوفة مركزية للأقسام والروابط). العناصر بعلامة `gated: true` تبدأ مخفية وتُظهَر حسب صلاحيات الباقة/المساعد. عناصر `assistantOnly: true` (دخول سريع، إيميل الاسترجاع) تظهر للمساعد فقط لأنه لا صفحة إعدادات منفصلة له.
- **`branding.js`** — يطبّق شعار/لون المدرس أو السنتر المخصَّص (وإلا الافتراضي)، من بيانات محفوظة في `sessionStorage` وقت الدخول (بدون نداء سيرفر إضافي).
- **`webauthn.js`** (`window.FasliWebauthn`) — الدخول بالبصمة/الوجه: بانر اقتراح تلقائي + إدارة الأجهزة المسجَّلة.
- **`recovery-email.js`** (`window.FasliRecoveryEmail`) — إدارة إيميل الاسترجاع (إضافة/تعديل/حذف)، موحَّد لكل الأدوار.
- **`custom-dialogs.js`** — بديل موحَّد لـ`confirm()`/`prompt()` الافتراضية بنفس تصميم المودالات (`.modal-overlay`/`.modal-box`).
- **`activity-format.js`** — يحوّل `(action_type + details)` من `activity_logs` لجملة عربية مقروءة.
- **`attendance-decisions.js`** (`window.__fasliDecisionQueue`) — نافذة/طابور "قرارات الحضور" الحديثة (القسم 7.4)، مشتركة بين `dashboard.html` و`assistant-dashboard.html`.
- **`sw.js`** — **مُعطَّل بالكامل عمدًا** (Service Worker) بعد مشاكل متكررة في تعليق نسخ قديمة من الكود على أجهزة المستخدمين رغم محاولات إصلاح استراتيجية التخزين المؤقت. **لا تُفعِّله مجددًا بدون سبب قوي جدًا وخطة تفريغ كاش واضحة.**

### 4.3 نمط تحميل الصفحة القياسي

كل صفحة تحمّل (بالترتيب): `session-restore.js` (head, مبكرًا) → `style.css?v=N` → مكتبات خارجية عند الحاجة (Chart.js) → `layout.js` → منطق الصفحة inline → في النهاية: `supabase-js` (UMD من jsdelivr) → `session-refresh.js` → `@simplewebauthn/browser` → `webauthn.js` → `recovery-email.js` → `branding.js` → `custom-dialogs.js`.

⚠️ **ملاحظة تخزين مؤقت:** أرقام الإصدار في أسماء الملفات (`style.css?v=63`, `attendance-decisions.js?v=3`) هي آلية **cache-busting يدوية** — **كل تعديل على `style.css` أو `attendance-decisions.js` يجب أن يرفع الرقم في كل صفحة تستدعيه**، وإلا قد يظل المستخدمون على نسخة قديمة مخزَّنة في متصفحاتهم (خصوصًا على الهاتف).

### 4.4 التصميم والألوان

`style.css` يستخدم متغيرات CSS (`--primary`, `--gray-900`...`--gray-50`, `--danger`, إلخ) تُعاد تعريفها لدعم **الوضع الداكن** (`body.dark-mode` أو ما شابه — تحقق من الآلية الفعلية في الملف عند الحاجة) والوضع الفاتح. **أي نص جديد يجب التأكد من نسبة تباين ≥ 4.5:1 في كلا الوضعين** — تكرر اكتشاف نصوص غير مقروءة (أزرار `.btn-outline`, نص تحذير أحمر فاتح) بعد إضافات جديدة (انظر القسم 9.2 لمنهجية القياس الآلي المستخدَمة).

---

## 5. المصادقة والهجرة إلى Supabase Auth

النظام **هاجر بالكامل** من JWT مخصَّص (توقيع يدوي بـ`djwt` ومفتاح `JWT_SECRET`) إلى **Supabase Auth الحقيقي**. النقاط الأساسية:

- **لكل حساب (مدرس/مساعد/ولي أمر/طالب) مستخدم Supabase Auth حقيقي**، بريد إلكتروني اصطناعي (`syntheticEmailFor(role, identifier)` على الأرجح في مكان مشترك — تحقق من `provisionAuthUser` في `manage-assistant` وما شابه)، وكلمة مرور Supabase حقيقية.
- **بيانات الدور** (`role`, `clientId`/`teacherId`, `username`, `phone`, `sub`, `name`) تُخزَّن في **`app_metadata`** وقت إنشاء الحساب — **وليس** بشكل ديناميكي، فأي تغيير على هذه البيانات (مثال: تغيير اسم) يجب أن يُحدَّث في `app_metadata` أيضًا إن كان الكود يعتمد عليها من هناك.
- **حساب المشرف الرئيسي (`Fasli-admin`)** هو صف عادي في `teachers` بـ`client_id = 'Fasli-admin'`، **لا يوجد فرق بنيوي خاص** — لكن دخوله عبر إيميل حقيقي مباشرة (مسار مختلف في `login.html`: `identifier.includes('@')` ← Supabase Auth مباشرة)، بينما استرجاع كلمة مروره **يستخدم نفس نظام الاسترجاع المخصَّص بالإيميل** (`request-password-reset`) بعد تسجيل إيميل استرجاع له مثل أي حساب — **وليس** `supabaseClient.auth.resetPasswordForEmail()` الجاهزة (أُلغيت لتبسيط الاسترجاع لمسار واحد موحَّد).
- **ربط حساب جوجل (Google OAuth) أُلغي بالكامل** بعد أن أصبح إيميل الاسترجاع المخصَّص يغطي كل الأدوار — لا يوجد أي كود متبقٍ لذلك (`google-link.js` حُذف، وكل الأزرار/الفروع المرتبطة).
- **الدخول بالبصمة/الوجه (WebAuthn)** يُعرَض للمستخدم دائمًا باسم **"دخول سريع"** (الاسم الداخلي للملفات/الدوال `webauthn`/`FasliWebauthn` بقي كما هو، فقط النص الظاهر تغيّر).
- **صفحة الدخول موحَّدة بحقل واحد** (بلا تبويبات "طاقم"/"أسرة" سابقة) — اكتشاف الدور يتم بالتجربة بالترتيب الثابت: `teachers.client_id` → `assistants.username` → `parents.phone` → `students.uid`، أول تطابق يفوز. **مخاطرة مقبولة صراحة:** لا ضمان تفرّد عبر الجداول الأربعة معًا (كل جدول متفرّد لوحده فقط)، اعتُبر احتمالًا ضعيفًا عمليًا في نظام بحجم فَصلي وقُبل كتنازل.

---

## 6. الأدوار والصلاحيات (ملخّص تنفيذي)

### 6.1 التسلسل الهرمي

```
Fasli-admin (مشرف النظام)
   └── teachers (مدرس عادي، أو "سنتر" إذا is_center=true)
          ├── assistants (مساعدون تابعون لهذا المدرس/السنتر، صلاحيات فردية قابلة للتخصيص)
          ├── instructor_names (لحسابات السنتر فقط: "أسماء مدرسين" فرعيين — ليسوا حسابات دخول)
          ├── groups (تخص المدرس، قد تُربط باسم مدرس فرعي)
          ├── students (ينتمون لمجموعة أساسية + مجموعات ثانوية اختيارية)
          │      └── parents (ولي أمر واحد أو أكثر لكل طالب عبر parent_phone)
```

### 6.2 الفرق الجوهري: مدرس منفرد مقابل سنتر (`teachers.is_center`)

هذا التمييز أصبح **محوريًا** بعد آخر تطوير (سبتمبر 2026) في نظام الحضور/الكارت تحديدًا:
- **مدرس منفرد:** حصة/وضع كارت واحد نشط في المرة الواحدة. المدرس **هو نفسه** المدرّس الوحيد (لا حاجة لاختيار "اسم مدرس" عند التفعيل).
- **سنتر:** عدة حصص/مسارات نشطة **في نفس الوقت** (كل مجموعة بحصتها الخاصة)، ويلزم تحديد "اسم المدرس الفرعي" (`instructor_name_id`) عند تفعيل الحضور لكل مجموعة، ويتحقق النظام أن المجموعة فعلًا مربوطة بذلك الاسم.
- **الفحص البرمجي القياسي:** `const { data: teacherRow } = await supabase.from("teachers").select("is_center").eq("client_id", tokenClientId).maybeSingle(); const isCenter = teacherRow?.is_center === true;` — **يُنفَّذ من جانب السيرفر دائمًا، لا يُعتمَد على قيمة من الواجهة**، وقد ثبّت هذا في نظام "المسارات" (القسم 7.3) كذلك.
- ملاحظة تاريخية: كان هناك خطأ (Batch 22) حيث `isCenter` كانت تُحفَظ للمدرس فقط عند الدخول وليس للمساعد، فتختفي عناصر واجهة يجب أن تظهر له رغم صلاحياته الكاملة — أُصلح بحفظ `isCenter` لكليهما في `sessionStorage` عند الدخول.

### 6.3 نوعا الصلاحيات (لا تخلط بينهما)

1. **صلاحيات الباقة (Plan Permissions)** — يحددها **الأدمن** للمدرس نفسه، مخزَّنة في `teachers.permissions`، تتحقق منها `requireTeacherPlanPermission`. مثال: مدرس بباقة أساسية قد لا يملك `can_use_rfid` أو `can_view_financial`.
2. **صلاحيات المساعد (Assistant Permissions)** — يمنحها **المدرس نفسه** لكل مساعد على حدة، مخزَّنة في `assistants.permissions`، تتحقق منها `requireAssistantPermission`. **لا تُطبَّق على المدرس نفسه إطلاقًا.**

كلاهما مستقل تمامًا: مساعد قد يملك `manage_attendance: true` بينما المدرس نفسه محروم من `can_use_rfid` على مستوى الباقة — في هذه الحالة `requireTeacherPlanPermission` (التي تُفحص أولًا عادة) سترفض الطلب بغض النظر عن صلاحية المساعد.

---

## 7. نظام الحضور والكارت — الشرح الكامل (أحدث وأعقد جزء في النظام)

هذا القسم يوثّق نتيجة سلسلة تطوير مكثّفة (أواخر سبتمبر 2026) حوّلت نظام الحضور من "وضع واحد بسيط" إلى نظام قرارات وتعويض ومسارات متعددة. **اقرأ هذا القسم كاملًا قبل أي تعديل على الحضور أو الكارت.**

### 7.1 المكوّنات الفعلية (Hardware) وتدفق المسحة

- الجهاز (`Fasli-T/Fasli-T.ino`, ESP32 + MFRC522) يرسل POST لدالتين مستقلتين عند كل مسحة كارت: `submit-rfid-scan` (تسجيل خام في `rfid_scans`، لا تأثير وظيفي) و**`record-attendance`** (المسار الفعلي المؤثِّر). التوثيق بـ`clientId + secret (device_secret)`، لا توكن مستخدم.
- **إشارات الصوت (buzzer) على الجهاز:** نبضة واحدة = نجاح، صفيرتان قصيرتان = فشل (مكرر/غير مسجَّل/خطأ)، **نبضة طويلة ثم قصيرة (`beepPending`) = بانتظار قرار المدرس** (حالة HTTP 202 مع `code: NEEDS_DECISION` — أُضيفت لاحقًا لتمييزها عن الفشل الحقيقي).
- `Fasli-T.ino` فيه ثوابت `CLIENT_ID`/`DEVICE_SECRET`/`SUPABASE_URL`/`ANON_KEY` **خاصة بكل جهاز فعلي مُبرمَج**، يجب تحديثها يدويًا (Arduino IDE) عند تغيير الحساب أو نقل مشروع Supabase.

### 7.2 الوضع القديم (`card_action_mode`) — لا يزال يعمل للمدرس المنفرد

صف واحد لكل مدرس. عند تفعيله (`action: "set"`) يحدَّد: أي أوضاع نشطة (`attendance_enabled`/`payment_enabled`/`book_payment_enabled` — يمكن أكثر من واحد معًا)، **وقت انتهاء موحَّد واحد** (`duration_minutes`، محسوب من ساعة اختارها المستخدم في حقل `<input type="time">`)، وإن كان الحضور مفعَّلًا: مجموعة + حصة (موجودة أو جديدة) + مدرس فرعي (سنتر فقط). **بعد انتهاء الوقت الموحَّد: كل الأوضاع تتوقف بالكامل** (`is_enabled: false`, `active_*` كلها `null`) — **وليس** رجوعًا لـ"حضور فقط" كما كان سلوكًا سابقًا (اعتُبر مضلِّلًا وأُصلح). **الدفع/سداد المذكرة لا يحتاجان مجموعة/حصة إطلاقًا** إن كان الحضور معطَّلًا ضمن الأوضاع المختارة — لكن **يحتاجان مجموعة الآن** إن استُخدما ضمن نظام المسارات (القسم 7.3، تعديل لاحق حسب طلب المستخدم).

### 7.3 نظام "المسارات" (`card_mode_lanes`) — حصص متعددة، للسنتر فقط

**القرار الأهم:** تعدد الحصص/الأوضاع النشطة معًا **متاح لحسابات السنتر فقط** (`is_center = true`)، مُنفَّذ من جانب السيرفر دون قابلية تجاوز من الواجهة. **المدرس المنفرد يبقى بوضع واحد نشط في المرة**؛ تفعيل مجموعة جديدة **يستبدل** الشغّالة تلقائيًا (لو التفعيل الجديد فشل بالتحقق، يبقى الشغّال القديم سليمًا — لا حذف مسبق).

- **كل "مسار" (lane)** = صف في `card_mode_lanes`، بمفتاح `unique(teacher_id, group_name)` — **مسار واحد فقط لكل مجموعة**، إعادة الحفظ لنفس المجموعة = تعديل لا إضافة. **المجموعة إجبارية لكل الأوضاع** (حتى الدفع فقط) — قرار صريح من المستخدم: "المستخدم لازم يحدد المجموعة اللي طلابها هيدفعوا".
- **كل مسار له وقت انتهاء مستقل** (`ends_at` مطلق)، لا وقت موحَّد للقارئ كله.
- **تحديد المسار عند المسحة**: يُحدَّد من **مجموعة الطالب نفسه** (الأساسية + الثانوية عبر `student_group_links`)، لا من اختيار مسبق على الجهاز:
  - **مسار واحد مطابق** → تنفيذ تلقائي فوري (حضور و/أو دفع و/أو مذكرة حسب أوضاع ذلك المسار تحديدًا).
  - **مساران أو أكثر مطابقان** (الطالب في مجموعتين، لكل منهما مسار) → **لا تنفيذ تلقائي** — يُسجَّل طلب "قرار" (`reason: "multi_lane"`) يختار فيه المدرس/المساعد أي مسار يُنفَّذ.
  - **لا مسار مطابق** (الطالب خارج كل المجموعات المفعَّلة) → **لا تنفيذ ولا رفض مباشر** — يُسجَّل طلب "قرار" (`reason: "no_lane"`).
- **التبديل بين الوضعين:** أول استخدام لـ`setLane` يوقف الوضع القديم (`card_action_mode.is_enabled = false`) تلقائيًا للحساب نفسه، والعكس (استخدام `set` القديم يمسح كل المسارات). **لا يعملان معًا أبدًا لنفس الحساب.**
- **التوافق الرجعي:** `record-attendance` يفحص `card_mode_lanes` أولًا؛ إن كان فارغًا يرجع تلقائيًا لقراءة `card_action_mode` القديم بلا أي تغيير — **أي جهاز/مدرس قديم غير مستخدَم للمسارات لا يتأثر إطلاقًا.**

### 7.4 طابور "قرارات الحضور" (`pending_attendance_decisions` + `attendance-decisions`)

**الفكرة الجوهرية:** عندما يكون تنفيذ عملية الكارت غامضًا (لا مسار مطابق أو أكثر من مسار)، **لا يُرفض الكارت ولا يُنفَّذ أي شيء تلقائيًا (لا حضور ولا دفع ولا مذكرة)** — يُسجَّل طلب معلَّق، وتظهر نافذة قرار حية في لوحة المدرس/المساعد (polling كل 3 ثوانٍ إن كان القارئ نشطًا، أبطأ غير ذلك) ليقرر:

| الخيار | التأثير |
|---|---|
| **رفض** | لا شيء يُسجَّل. فترة تبريد **دقيقتين فقط لهذا الطالب تحديدًا** (لا تمنع أي طالب آخر ولا توقف القارئ — قرار صريح من المستخدم لتفادي تعطيل الزحمة). |
| **تعويض حصة فاتت (`makeup_past`)** | يحوّل صف غياب سابق لنفس الطالب (خلال آخر 30 يومًا) إلى "حاضر"، **بشرط أن يكون نفس المدرس الفرعي في الحصتين** (قيد صريح من المستخدم). الصف يبقى تحت الحصة/المجموعة **الأصلية** (لا يُحتسب غائبًا)، مع `is_makeup=true`, `attended_via_group`/`attended_via_session_id` يشيران للحصة **التي حضرها فعليًا**. |
| **حضور مبكر (`early_future`)** | إنشاء حصة **مستقبلية** (`scheduled_only=true`) لمجموعة الطالب الأصلية، أو اختيار حصة مستقبلية موجودة، وتسجيله حاضرًا فيها مسبقًا. |
| **تنفيذ مسار (`run_lane`)** | فقط عند `multi_lane` (اختيار أي المسارين يُنفَّذ) أو `no_lane` (تنفيذ **استثنائي** لدفع/مذكرة فقط لطالب خارج المجموعة — **ليس حضورًا**، والحضور له مسار تعويض/مبكر منفصل). ينفَّذ عبر **نداء داخلي لـ`record-attendance` نفسها** بترويسة `x-internal-key` (تساوي `SUPABASE_SERVICE_ROLE_KEY`) و`forceLaneGroup`، بدل تكرار منطق الدفع. |

**تفاصيل تقنية حرجة:**
- **الذرّية:** حسم القرار (`resolve`) يستخدم `UPDATE ... WHERE status='pending' ... RETURNING` — أول من ينجح (مدرس أو مساعد يضغطان معًا) يفوز، والآخر يتلقى 409. لو فشل التنفيذ الفعلي بعد الحسم (مثلًا خطأ شبكة)، الطلب **يعود لحالة `pending`** بمهلة جديدة (3 دقائق) بدل أن يُفقَد.
- **فهرس تفرّد جزئي:** `unique(teacher_id, student_uid) where status='pending'` — تكرار مسح نفس الطالب أثناء الانتظار **لا يفتح طلبًا ثانيًا**.
- **ذاكرة الموافقة:** موافقة حضور فعلي (`makeup_past`/`early_future`) تُتذكَّر **12 ساعة** (مسحة لاحقة = `DUPLICATE_IGNORE`)، أما **تنفيذ الدفع الاستثنائي (`run_lane`) فذاكرته 15 دقيقة فقط** — تعديل صريح بعد اكتشاف أن الذاكرة الطويلة كانت تمنع تعويض حضور لاحق لنفس الطالب لمدة 12 ساعة كاملة بعد مجرد دفعة استثنائية.
- **صلاحيات المساعد على القرارات:** استقبال/عرض القرارات يحتاج `manage_attendance`، وتنفيذ دفع/مذكرة استثنائي (`run_lane` مع `no_lane`) يحتاج **أيضًا** `record_payments`/`manage_books` حسب البند — قرار أمني صريح (كان يمكن لمساعد بلا صلاحية دفع أن ينفّذ دفعًا عبر هذه النافذة).
- **صلاحية `manage_card_mode` تحكم بدء الـpolling بالكامل** — مساعد بلا أي صلاحية حضور لا يرسل أي طلب شبكة لهذه الميزة إطلاقًا (تحسين أداء وأمان).
- **الضيف في سجلات الحصص:** طالب عوَّض/حضر مبكرًا يظهر في **كلا** السجلّين: سجل الحصة **التي حضرها فعليًا** (بعلامة "ضيف — تعويض/حضور مبكر (من مجموعة X)"، غير محتسَب في إجمالي أفراد تلك المجموعة) وسجل حصته **الأصلية** (بعلامة "حاضر — تعويض (مع مجموعة Y)").

### 7.5 سلامة التزامن (Concurrency) — مسحات/طلبات متزامنة حقيقية

اختُبر هذا بشكل مباشر (10-50 مسحة متزامنة فعلية عبر `Promise.all`) بعد ملاحظة أن المسحات المزدحمة (وقت دخول حصة كاملة) سيناريو متوقَّع جدًا:
- **فهرس تفرّد فعلي في قاعدة البيانات** `unique(student_uid, session_id) where session_id is not null` على `attendance` — الإدراج الثاني المتزامن يفشل بخطأ 23505 ويُعامَل كـ`DUPLICATE_IGNORE` صراحة في الكود (وليس فحص "اقرأ ثم اكتب" وحده، غير كافٍ تحت تزامن حقيقي).
- **`card_scan_locks`** — قفل قصير العمر (30 ثانية، "fail-open" عمدًا: أي خطأ غير تعارض المفتاح يتجاوز القفل ويكمل العملية، حتى لا يصبح القفل نفسه نقطة فشل جديدة) حول كل عملية دفع/سداد مذكرة، بمفتاح `(teacher_id, student_uid, op, op_key)`.
- **نتيجة الاختبار المرجعي:** 20 طالبًا × 3 مسحات متزامنة لكل منهم = 20 نجاحًا بالضبط (لا تكرار ولا فقدان)، تحقَّق منه بقراءة قاعدة البيانات مباشرة (`get-payments`) وليس فقط برسائل الرد (رسائل الرد وحدها قد تبدو "قيد المعالجة" لبعضها رغم نجاح العملية فعليًا في مسحة موازية).

### 7.6 التحكم بالحصص من الواجهة (`manage-group-sessions`)

- `endNow` — إنهاء الحصة يدويًا **في نفس اليوم فقط**، يضبط `ended_at`، ثم ينادي `check-session-absences` داخليًا لاحتساب غياب من لم يسجّل فورًا (بدل انتظار انقضاء المهلة الطبيعية).
- `delete` — حذف من سجل الحصص، **مسموح من أي يوم** (القيد الوحيد المتبقي: يجب ألا يوجد أي صف حضور فعلي مسجَّل على الحصة — حماية من فقدان بيانات حقيقية، بينما قيد "نفس اليوم فقط" القديم اعتُبر بلا فائدة أمان إضافية حقيقية وأُزيل).
- `rosterForSession` — سجل حضور/غياب الحصة الكامل، يجمع طلاب المجموعة الأساسيين + الثانويين (`student_group_links`) + أي "ضيوف" حضروا كتعويض/مبكر.

### 7.7 فحص الغياب التلقائي (`check-session-absences`)

- نافذة فحص **3 أيام سابقة** (ليس اليوم فقط) — لتغطية أي حصة أُنشئت آخر اليوم ولم تُفحص قبل انتهائه (منطق دوري متكرر آمن، `alreadyMarkedUids` يمنع التكرار).
- **يتخطى الحصص `scheduled_only=true`** (حصص حضور مبكر مستقبلية لم تُفتح بعد فعليًا) — وإلا سيُحتسَب غياب جماعي وهمي فور دخول تاريخها لكل المجموعة بناءً على `created_at` قديم غير حقيقي.
- **لا يُحتسَب غياب لمجموعة كاملة إذا لم يحضر أحد إطلاقًا** لتلك الحصة (`presentUids.size === 0` → تخطّي) — لا دليل أن الحصة "حدثت" فعليًا (عطل قارئ، إلغاء فعلي، إلخ).
- يمكن استدعاؤها بنداء نظامي (`systemRun: true` + `x-cron-secret` يطابق `CRON_SECRET`) يغطي كل المدرسين دفعة واحدة، أو بتوكن مستخدم عادي (مدرس واحد، عند فتح لوحته).

---

## 8. اختبار Batch 27/44/45 — إشارات تاريخية للأخطاء الجسيمة السابقة

هذه أرقام "دفعات" (Batches) ظهرت كتعليقات متكررة في الكود تشير لجلسات إصلاح سابقة مهمة — إن ظهر رقم دفعة في تعليق جديد فهو يشير لنفس التسلسل التاريخي:
- **Batch 27:** أمان حرج — `verifyToken` لم تكن تتحقق من `assistants.is_active` إطلاقًا (مساعد مفصول يبقى توكنه فعّالًا كاملًا حتى انتهائه الطبيعي)؛ كذلك `activity_logs` لتسجيل الحضور كان ناقصًا `teacher_id`/`entity_type` (NOT NULL) ففشل صامتًا بلا أي أثر في السجل لأهم عملية يومية في النظام؛ وحقل `status` لم يكن يُحفَظ في صفوف الغياب التلقائي رغم `is_absent=true` (تناقض كسر حسابات أخرى تعتمد على `status`).
- **Batch 44:** طلاب المجموعات الثانوية (`student_group_links`) لم يكونوا يُحتسَبون في فحص الغياب رغم احتسابهم في تسجيل الحضور نفسه — عدم تطابق بين مسارين يفترض أن يتطابقا.
- **Batch 45:** أداء — استعلامات مستقلة (كارت/إعدادات/وضع) كانت متسلسلة رغم استقلالها التام، في أكثر جزء متكرر بالنظام (كل مسحة كارت) — حُوِّلت لـ`Promise.all`.

---

## 9. منهجية التطوير والاختبار المتَّبعة (اتّبعها لأي تطوير مستقبلي)

### 9.1 قبل كتابة أي كود جديد على وظيفة موجودة

اقرأ الدالة/الملف المعني **كاملًا** أولًا (لا تعديل جزئي أعمى)، وابحث عن أنماط مشابهة موجودة بالفعل في المشروع لتقليدها (مثال: عند إضافة "قفل تزامن" جديد، قلّد نمط `card_scan_locks` الموجود بدل اختراع نمط جديد).

### 9.2 دورة migration + كود معتمِد عليها (تسلسل إجباري)

1. اكتب ملف `.sql` جديد في `supabase/migrations/` بتاريخ اليوم (`YYYYMMDDHHMMSS_وصف.sql`)، بصيغة `if not exists`/`if not exists` دائمًا (آمن لإعادة التشغيل).
2. اشرح للمستخدم محتوى الملف وسببه، واطلب تنفيذه من **Supabase Dashboard → SQL Editor** (لا يمكن تنفيذه تلقائيًا من الجلسة).
3. **لا تنشر أي كود Edge Function يعتمد على العمود/الجدول الجديد قبل تأكيد المستخدم أن التنفيذ تمّ** — انتظار صريح، لا افتراض.
4. بعد التأكيد: انشر الكود، ثم اختبر حيًّا (القسم التالي).

### 9.3 الاختبار الحي عبر حسابات تجريبية قابلة للحذف (الطريقة المعتمَدة الوحيدة الموثوقة)

**لا اختبارات وحدة (unit tests) في المشروع.** بدلًا من ذلك، تُكتَب سكربتات Node.js مؤقتة (في مجلد scratchpad الخاص بالجلسة، **ليست جزءًا من المستودع**) تنفّذ تسلسلًا حقيقيًا كاملًا عبر `fetch` مباشر لعناوين `https://ugvuwiaemrrtwplphkdn.supabase.co/functions/v1/<name>` (باستخدام مفتاح `anon` الثابت المذكور في `submit-rfid-scan`/الفرونت إند):

1. دخول كأدمن (`Fasli-admin`/`147852963`).
2. إنشاء مدرس تجريبي بمعرّف مميَّز يسهل التعرّف عليه وحذفه لاحقًا (مثال: `LANETEST1`, `DECTEST1`) — **الشرط: المعرّف 6 أحرف/أرقام على الأقل** (يُستخدم ككلمة مرور مبدئية).
3. تغيير كلمة المرور، إعادة الدخول، بناء بيانات تجريبية كاملة (مجموعات، طلاب، كروت عبر محاكاة الماستر `manage-master-scan`+`submit-master-card-scan`، ربط الكروت).
4. تنفيذ السيناريوهات الفعلية (مسحات حقيقية، تفعيل مسارات، حسم قرارات...) والتحقق من الردود **وقراءة قاعدة البيانات مباشرة** عند الشك (وليس فقط الرسالة النصية).
5. **حذف الحساب التجريبي في نهاية كل سكربت دائمًا** (`admin-manage-teacher action=delete`)، والتحقق لاحقًا بمحاولة دخول تُرجع 404 كإثبات فعلي للحذف — **لا افتراض نجاح الحذف بدون تحقق**.
6. اختبار السباقات (race conditions) يتم فعليًا بـ`Promise.all([...مسحات متعددة])` لنفس الكارت/طلاب مختلفين في نفس اللحظة، وليس بمسحات متتالية.

**اختبار الواجهة بصريًا:** عبر متصفح Claude Code المدمج، بوسيط محلي (`ui_proxy.js` في scratchpad — سيرفر Node.js صغير يقدّم `frontend/` مباشرة **ويُعيد توجيه** أي مسار `/functions/v1/...` إلى Supabase الفعلي من جانب السيرفر، متجاوزًا قيود CORS التي كانت تمنع تشغيل الواجهة من `localhost` مباشرة ضد Supabase الحقيقي). يُستخدم لفحص: ظهور المودالات، تباين الألوان (سكربت `audit.js` مخصَّص يحسب نسبة تباين WCAG فعلية لكل نص داخل عنصر جذر معيّن في كلا الوضعين الفاتح/الداكن)، السلوك على مقاس الهاتف (`resize_window preset: mobile`، 375×812).

### 9.4 نشر Edge Functions

```bash
export SUPABASE_ACCESS_TOKEN=<personal-access-token>   # يُطلب من المستخدم، ينتهي أحيانًا ويحتاج تجديدًا
npx supabase@latest functions deploy <function-name> --project-ref ugvuwiaemrrtwplphkdn
```
**تحقّق دائمًا من مخرجات الأمر الفعلية** (رسالة `"Deployed Functions."` صريحة) قبل افتراض النشر نجح — حدث خطأ سابق حيث اعتُبر النشر ناجحًا بناءً على عدم ظهور خطأ ظاهر بينما كانت المخرجات الفعلية مجرد تحذير npm غير ذي صلة، والنشر الحقيقي فشل بصمت (401 توكن منتهي) دون أن يُلاحَظ إلا بإعادة فحص المخرجات الخام.

### 9.5 الالتزام بـGit والدفع

- التزام لكل تغيير منطقي متماسك برسالة تشرح **السبب** لا فقط "ماذا" (نمط كل رسائل الكود في هذا المشروع: تعليقات `✅` تشرح القرار والسبب، وليس وصفًا حرفيًا للكود).
- دفع الأوامر الطويلة (git push خصوصًا) يُفضَّل تشغيله في الخلفية (`run_in_background`) وانتظار إشعار الاكتمال الفعلي، **لا افتراض أن الأمر نجح لمجرد عدم ظهور خطأ فوري** — تحقّق لاحقًا بمقارنة hash محلي مقابل `git ls-remote origin refs/heads/<branch>`.

---

## 10. مسرد عربي↔مصطلح تقني (لتفادي الالتباس عند القراءة لاحقًا)

| المصطلح بالعربي (كما يستخدمه صاحب المشروع) | المصطلح/الحقل التقني |
|---|---|
| وضع الكارت | `card_action_mode` (القديم) أو `card_mode_lanes` (المسارات، للسنتر) |
| المسار | صف في `card_mode_lanes` (مجموعة + أوضاعها + وقت انتهائها) |
| بانتظار قرار / نافذة القرار | `pending_attendance_decisions` + دالة `attendance-decisions` + `attendance-decisions.js` |
| تعويض حصة فاتت | `resolution: "makeup_past"` |
| حضور مبكر | `resolution: "early_future"`, يخلق حصة `scheduled_only=true` |
| تنفيذ استثنائي / تنفيذ مسار | `resolution: "run_lane"` |
| ضيف | صف حضور `is_makeup=true` يظهر في سجل حصة غير حصته الأصلية |
| اسم المدرس (في سياق السنتر) | `instructor_names` — ليس حساب دخول، مجرد تصنيف/اسم |
| مجموعة ثانوية | `student_group_links` (تعدد مواد/مجموعات لنفس الطالب) |
| الحصة اليومية | صف في `attendance_sessions` (نظام حديث، ليس تكرارًا أسبوعيًا) |
| دخول سريع | WebAuthn/Passkeys (بصمة/وجه) — الاسم الداخلي للكود يبقى `webauthn` |
| إيميل الاسترجاع | `recovery_email` + `recovery_email_verified`، نظام استرجاع ذاتي بديل عن جوجل |
| الباقة / صلاحيات الباقة | `teachers.permissions`، يديرها الأدمن |
| صلاحيات المساعد | `assistants.permissions`، يديرها المدرس |
| السنتر | `teachers.is_center = true` (وجدول `centers` منفصل للكيان ذاته) |

---

## 11. نقاط يجب الانتباه إليها عند أي تطوير مستقبلي (قائمة تحقّق سريعة)

- [ ] هل التغيير يمسّ `students.group_name` أو أي نص حر مشابه؟ تذكّر أنه **ليس FK** — تحقّق من كل الجداول التي تخزّن نفس الاسم نصًا.
- [ ] هل يضيف الكود `upsert(...).onConflict(...)`؟ تأكّد من وجود `unique`/`primary key` فعلي مطابق في قاعدة البيانات أولًا.
- [ ] هل يفحص الكود "هل يوجد صف معلّق/نشط"؟ تأكّد من فلترة الحالة الصريحة (لا يكفي وجود الصف، الجدول قد يُحدَّث لا يُحذف).
- [ ] هل التغيير في `frontend/style.css` أو `attendance-decisions.js`؟ ارفع رقم الإصدار (`?v=N`) في **كل** صفحة تستدعيه.
- [ ] هل التغيير في `frontend/*`؟ يجب نسخه لاحقًا لفرعي `deploy-sync` و`main` (النشر الفعلي) — لن يظهر للمستخدمين من `master` وحده.
- [ ] هل التغيير في Edge Function تعتمد عليها دالة أخرى بنداء داخلي؟ تأكّد من تمرير `apikey` **و** `Authorization` معًا.
- [ ] هل الميزة الجديدة تخص حسابات السنتر أم المدرس المنفرد أم كليهما؟ افحص `teachers.is_center` من السيرفر دائمًا، لا تعتمد على قيمة من الواجهة.
- [ ] هل الميزة تمسّ صلاحية جديدة؟ حدّد إن كانت **صلاحية باقة** (يتحكم بها الأدمن) أو **صلاحية مساعد** (يتحكم بها المدرس) — لا تخلط.
- [ ] بعد أي تعديل، هل أُعيد تشغيل اختبارات الانحدار الأساسية (سيناريوهات الحضور الشاملة، المسارات، القرارات) قبل الإعلان عن الانتهاء؟
- [ ] هل حُذفت كل الحسابات التجريبية المُنشأة أثناء الاختبار، وتحقَّقتَ من الحذف فعليًا (لا افتراضًا)؟

---

*نهاية الملف. لأي تفصيلة غير موجودة هنا، الكود الفعلي في المستودع هو المرجع النهائي الأدق — هذا الملف يلخّص السياق والقرارات، لا يستبدل قراءة الكود.*
