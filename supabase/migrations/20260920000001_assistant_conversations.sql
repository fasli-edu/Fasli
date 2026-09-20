-- supabase/migrations/20260920000001_assistant_conversations.sql
-- ============================================
-- محادثة مباشرة بين المدرس ومساعديه — نفس بنية conversation_messages (محادثات أولياء الأمور)
-- بالظبط، بس الطرف التاني هنا مساعد بدل ولي أمر/طالب. كل صف تبادل رسالة واحد؛ "الترييد" (thread)
-- الضمني هو (teacher_id, assistant_id) زي ما الترييد في محادثات أولياء الأمور هو
-- (teacher_id, student_uid, parent_phone).
-- ============================================
create table if not exists assistant_messages (
  id bigserial primary key,
  teacher_id text not null references teachers (client_id) on delete cascade,
  assistant_id bigint not null references assistants (id) on delete cascade,
  sender_role text not null check (sender_role in ('teacher', 'assistant')),
  sender_name text not null,
  message text not null,
  is_read_by_teacher boolean not null default false,
  is_read_by_assistant boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_assistant_messages_thread on assistant_messages (teacher_id, assistant_id, created_at);

alter table assistant_messages enable row level security;
-- ✅ مفيش policies هنا عمداً — نفس نمط conversation_messages بالظبط، كل الوصول عن طريق
-- service_role في الدوال (اللي بتعمل التحقق من الصلاحية في كود التطبيق نفسه)، فمفيش داعي
-- لـpolicies لـanon/authenticated لأن مفيش حد بيستخدمهم مباشرة على الجدول ده
