-- طابور "قرارات الحضور": لما طالب يمرّر كارته وهو مش تابع لمجموعة الحصة/المسار الشغّال (أو
-- فيه لبس في تحديد مساره)، السيرفر ما بيرفضش ولا بينفّذ — بيسجّل هنا طلب "بانتظار قرار"،
-- ولوحة المدرس/المساعد بتعرضه في نافذة قرار (رفض / تعويض حصة فاتت / حضور مبكر).
-- ما بيتنفّذ أي حاجة (حضور/دفع/مذكرة) قبل القرار.
create table if not exists pending_attendance_decisions (
  id bigint generated always as identity primary key,
  teacher_id text not null references teachers (client_id) on delete cascade,
  student_uid text not null references students (uid) on delete cascade,
  student_name text,
  home_group_name text,
  card_uid text,

  -- الحصة/المجموعة اللي كانت شغّالة على القارئ وقت المسح (اللي الطالب مش تابع لها)
  active_group_name text,
  active_session_id bigint references attendance_sessions (id) on delete set null,
  active_session_label text,
  active_instructor_name_id bigint references instructor_names (id) on delete set null,
  active_instructor_name text,

  -- سبب فتح النافذة: no_lane = خارج كل المجموعات المفعّلة، multi_lane = في أكتر من مسار
  -- نشط، ...؛ والسياق (مثلاً قايمة المسارات المرشّحة) في context عشان الدفعة الجاية من
  -- المسارات المتعددة ما تحتاجش تعديل تاني على الجدول
  reason text not null default 'no_lane',
  context jsonb,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired')),
  resolution text,            -- reject | makeup_past | early_future | run_lane (تنفيذ استثنائي)
  resolved_by_role text,
  resolved_by_id text,
  resolved_by_name text,
  resolved_at timestamptz,

  expires_at timestamptz not null default (now() + interval '2 minutes'),
  created_at timestamptz not null default now()
);

-- طلب معلّق واحد بس لكل (مدرس + طالب): تكرار مسح نفس الكارت أثناء الانتظار مايفتحش نافذة
-- تانية، وقرار مدرس ومساعد في نفس اللحظة بيتحسم من غير ازدواج (الأول بس اللي بينجح)
create unique index if not exists pending_attendance_decisions_one_pending
  on pending_attendance_decisions (teacher_id, student_uid)
  where status = 'pending';

create index if not exists pending_attendance_decisions_queue
  on pending_attendance_decisions (teacher_id, status, created_at);

alter table pending_attendance_decisions enable row level security;
