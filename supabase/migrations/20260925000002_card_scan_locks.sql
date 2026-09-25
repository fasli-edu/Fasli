-- أقفال قصيرة العمر لمنع تنفيذ نفس العملية (دفع بند / سداد مذكرة) مرتين لو وصل كارتان لنفس
-- الطالب في نفس اللحظة. مش قيد تفرّد على payments/book_payments نفسها لأن ممكن يكون فيها
-- بنود مكررة مشروعة قديمة (أقساط) — القفل مؤقت (بيتشال بعد ما العملية تخلص، وأي قفل عمره أكتر
-- من 30 ثانية بيتعتبر عالق وبيتم تجاوزه) فمابيأثرش على أي بيانات موجودة.
create table if not exists card_scan_locks (
  teacher_id text not null,
  student_uid text not null,
  op text not null,
  op_key text not null,
  created_at timestamptz not null default now(),
  primary key (teacher_id, student_uid, op, op_key)
);
alter table card_scan_locks enable row level security;
