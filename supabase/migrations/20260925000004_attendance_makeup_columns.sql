-- أعمدة الحضور التعويضي/المبكر على جدول attendance.
-- صف الحضور بيفضل تابع لمجموعة الطالب الأصلية وحصتها (عشان ماتتحسبش غياب وتقاريره تفضل
-- سليمة)، والأعمدة دي بتسجّل إنه حضر فعلياً في مجموعة/حصة تانية:
--   is_makeup                 = هل الحضور ده تعويض/مبكر
--   makeup_type               = past (تعويض حصة فاتت) | early (حضور مبكر لحصة قادمة)
--   attended_via_group        = المجموعة اللي حضر معاها فعلياً
--   attended_via_session_id   = الحصة اللي حضرها فعلياً (عشان تظهر "ضيف — تعويض" في قايمتها)
alter table attendance add column if not exists is_makeup boolean not null default false;
alter table attendance add column if not exists makeup_type text;
alter table attendance add column if not exists attended_via_group text;
alter table attendance add column if not exists attended_via_session_id bigint
  references attendance_sessions (id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_makeup_type_check') then
    alter table attendance add constraint attendance_makeup_type_check
      check (makeup_type is null or makeup_type in ('past', 'early'));
  end if;
end $$;

create index if not exists attendance_attended_via_session_idx
  on attendance (attended_via_session_id)
  where attended_via_session_id is not null;
