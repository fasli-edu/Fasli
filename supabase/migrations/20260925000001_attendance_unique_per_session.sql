-- يمنع صفّين حضور لنفس الطالب في نفس الحصة لو وصل كارتان (أو كارت + يدوي) في نفس اللحظة —
-- الفحص القديم في record-attendance كان "اقرأ ثم اكتب" من غير أي ضمان على مستوى قاعدة البيانات.
--
-- الفهرس بيتنشأ بس لو مفيش تكرار موجود فعلاً (عشان الإنشاء ما يفشلش ويوقف باقي الملف على
-- بيانات قديمة)؛ لو لقى تكرار، بيطبع تنبيه ويتخطى الإنشاء من غير ما يمسح أو يعدّل أي بيانات —
-- التنظيف اليدوي للتكرار القديم قرار المستخدم مش قرار هجرة تلقائية.
do $$
begin
  if exists (
    select 1 from attendance
    where session_id is not null
    group by student_uid, session_id
    having count(*) > 1
  ) then
    raise notice 'attendance already has duplicate (student_uid, session_id) rows — unique index skipped, clean duplicates first';
  else
    create unique index if not exists attendance_student_session_uniq
      on attendance (student_uid, session_id)
      where session_id is not null;
  end if;
end $$;
