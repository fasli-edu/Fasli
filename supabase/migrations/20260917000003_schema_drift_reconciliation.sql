-- ============================================
-- انحراف مخطط متراكم (schema drift) — أعمدة اتضافت مباشرة على قاعدة بيانات الإنتاج
-- على مدار الوقت من غير ما توثّق في أي migration، اتكشفت كلها دفعة واحدة لما اتقارن
-- مخطط الإنتاج الحي بمخرجات كل migrations المحلية أثناء بناء مشروع Supabase جديد من
-- الصفر. كل عمود هنا اتأكد استخدامه الفعلي في كود الـfunctions الحالي قبل إضافته.
-- ============================================

-- أعمدة تدقيق (created_at) اتضافت لعدة جداول بالجملة من غير migration موثّقة
alter table books add column if not exists created_at timestamptz not null default now();
alter table exam_titles add column if not exists created_at timestamptz not null default now();
alter table expenses add column if not exists created_at timestamptz not null default now();
alter table groups add column if not exists created_at timestamptz not null default now();
alter table login_ads add column if not exists created_at timestamptz not null default now();
alter table parents add column if not exists created_at timestamptz not null default now();
alter table payment_titles add column if not exists created_at timestamptz not null default now();
alter table photo_album_images add column if not exists created_at timestamptz not null default now();
alter table photo_albums add column if not exists created_at timestamptz not null default now();
alter table portal_banners add column if not exists created_at timestamptz not null default now();
alter table push_tokens add column if not exists created_at timestamptz not null default now();
alter table push_tokens add column if not exists updated_at timestamptz not null default now();
alter table student_group_links add column if not exists created_at timestamptz not null default now();
alter table students add column if not exists created_at timestamptz not null default now();

-- teachers: مستخدمين فعليًا في manage-center (absence_threshold_minutes) وadmin-manage-teacher (notes)
alter table teachers add column if not exists absence_threshold_minutes integer not null default 30;
alter table teachers add column if not exists notes text;

-- activity_logs: مستخدم في get-activity-logs
alter table activity_logs add column if not exists ip_address text;

-- assistants: مستخدم في login (تحديث آخر دخول)
alter table assistants add column if not exists last_login timestamptz;

-- exam_answers: الكود الفعلي (take-exam) بيكتب في الأعمدة دي بدل عمود answer القديم
alter table exam_answers add column if not exists selected_answer text;
alter table exam_answers add column if not exists is_correct boolean;
alter table exam_answers add column if not exists points_earned numeric;

-- exam_attempts: مستخدم في take-exam/get-exam-report
alter table exam_attempts add column if not exists started_at timestamptz not null default now();

-- pending_card_registrations: مستخدمين في مسار تسجيل الكروت (card-action-mode/manage-master-scan)
alter table pending_card_registrations add column if not exists student_name text;
alter table pending_card_registrations add column if not exists student_uid text;

-- push_tokens: مستخدم في send-bulk-message (اختيار المنصة عشان صيغة الإشعار)
alter table push_tokens add column if not exists platform text;

-- registration_requests: مستخدمين في submit-registration-request/manage-registration-requests
alter table registration_requests add column if not exists level_id bigint references education_levels (id) on delete set null;
alter table registration_requests add column if not exists notes text;
alter table registration_requests add column if not exists parent_name text;
alter table registration_requests add column if not exists student_phone text;

-- rfid_scans: الجدول اتوسّع من مجرد client_id لتسجيل كل مسح فعلي (manage-master-scan/card-action-mode)
alter table rfid_scans add column if not exists scanned_at timestamptz not null default now();
alter table rfid_scans add column if not exists uid text;

-- card_action_mode: الميزة اتوسّعت بالكامل (وضع الحضور/المدفوعات/الكتب بتفاصيلهم) من غير migration
alter table card_action_mode add column if not exists action_type text;
alter table card_action_mode add column if not exists active_group_name text;
alter table card_action_mode add column if not exists active_instructor_name_id bigint references instructor_names (id) on delete set null;
alter table card_action_mode add column if not exists active_session_id bigint;
alter table card_action_mode add column if not exists active_session_label text;
alter table card_action_mode add column if not exists book_amount numeric;
alter table card_action_mode add column if not exists book_id bigint references books (id) on delete set null;
alter table card_action_mode add column if not exists duration_minutes integer;
alter table card_action_mode add column if not exists is_enabled boolean not null default false;
alter table card_action_mode add column if not exists payment_amount numeric;
alter table card_action_mode add column if not exists payment_title text;
alter table card_action_mode add column if not exists set_at timestamptz;
alter table card_action_mode add column if not exists set_by text;
