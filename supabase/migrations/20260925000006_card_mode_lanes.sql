-- "مسارات" وضع الكارت: قارئ واحد (قارئ المدرس، أو قارئ حساب السنتر) يشتغل على أكتر من مجموعة/حصة
-- في نفس الوقت. كل مسار = مجموعة واحدة + أوضاعها (حضور بحصة / دفع اشتراك / سداد مذكرة) + وقت
-- انتهاء مستقل. لما كارت يتمرّغ، السيرفر بيحدد المسار من مجموعة الطالب نفسه.
--
-- المسارات بتتجاور مع صف card_action_mode القديم (مش بديل له): لو فيه مسار نشط، المسارات هي
-- المرجع، ولو مفيش أي مسار نشط بيفضل السلوك القديم شغّال زي ما هو (توافق كامل مع أي نسخة
-- قديمة من الواجهة).
create table if not exists card_mode_lanes (
  id bigint generated always as identity primary key,
  teacher_id text not null references teachers (client_id) on delete cascade,

  -- المجموعة اللي طلابها بيتنفّذ عليهم المسار ده تلقائي (إجباري لكل الأوضاع، حتى الدفع)
  group_name text not null,

  attendance_enabled boolean not null default false,
  session_id bigint references attendance_sessions (id) on delete set null,
  session_label text,
  instructor_name_id bigint references instructor_names (id) on delete set null,
  instructor_name text,

  payment_enabled boolean not null default false,
  payment_title text,
  payment_amount numeric,

  book_payment_enabled boolean not null default false,
  book_id bigint references books (id) on delete set null,
  book_amount numeric,

  -- وقت الانتهاء المطلق لكل مسار على حدة (بدل عدّاد واحد للقارئ كله)
  ends_at timestamptz not null,
  set_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- مسار واحد بس لكل مجموعة: إعادة الحفظ لنفس المجموعة = تعديل المسار مش إضافة مسار تاني
  unique (teacher_id, group_name)
);

create index if not exists card_mode_lanes_active on card_mode_lanes (teacher_id, ends_at);

alter table card_mode_lanes enable row level security;
