-- ============================================
-- notifications_recipient_check كان بيسمح بإشعار موجّه للمدرس (teacher_id بس، من غير
-- parent_phone/assistant_id) في حالة واحدة بس: type = 'center_teacher_message'. أي إشعار
-- تاني موجّه للمدرس (زي تنبيهات الطلاب المعرّضين للخطر check-at-risk-alerts) كان بيترفض
-- بالكامل من قاعدة البيانات — الإدراج كان بيفشل، والميزة كلها بتفشل بصمت لإنه محدش بيتحقق
-- من الخطأ. بنعمم الشرط: أي إشعار audience='teacher' ومعاه teacher_id يبقى مقبول، بغض النظر
-- عن type.
-- ============================================

-- ✅ العمود ده كان مضاف مباشرة على قاعدة بيانات الإنتاج من غير أي migration موثّقة له
-- (انحراف مخطط — نفس فئة activity_logs_client_id_fkey المكتشفة في نفس الجلسة). بنوثّقه
-- هنا رسميًا (بنفس شكل العمود المطابق في activity_logs) قبل استخدامه تحت في الـconstraint —
-- IF NOT EXISTS يخليها no-op آمنة تمامًا على أي قاعدة بيانات موجود فيها العمود بالفعل.
alter table notifications add column if not exists assistant_id bigint references assistants (id) on delete set null;

alter table notifications drop constraint if exists notifications_recipient_check;

alter table notifications add constraint notifications_recipient_check check (
  parent_phone is not null
  or assistant_id is not null
  or (coalesce(audience, '') = 'student' and student_uid is not null)
  or (coalesce(audience, '') = 'teacher' and teacher_id is not null)
  or (type = 'center_teacher_message' and teacher_id is not null)
);
