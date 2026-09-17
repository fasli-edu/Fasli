-- ============================================
-- الحماية من محاولات الدخول المتكررة كانت بتقرأ عدد المحاولات الحالي (SELECT) وبعدين تكتب
-- القيمة الجديدة (UPSERT) في نداءين منفصلين — مش عملية ذرية واحدة. طلبات متزامنة (زي أداة
-- هجوم بروت-فورس بترسل عشرات المحاولات في نفس اللحظة) كل واحدة فيها بتقرأ نفس العدد القديم
-- قبل ما أي واحدة تكتب الجديد، فكلهم بيزيدوا من نفس القيمة الأصلية بدل ما يتراكموا فوق بعض —
-- الحد الأقصى (5 محاولات) بيتخطّى بسهولة لو الهجوم متوازي مش متسلسل. الحل: دالة SQL واحدة
-- بتعمل INSERT ... ON CONFLICT DO UPDATE ذرّي بالكامل (Postgres بيقفل الصف نفسه أثناء
-- المعاملات المتزامنة على نفس username، فمفيش سباق ممكن يحصل).
-- ============================================

create or replace function register_login_attempt(p_username text, p_max_attempts int, p_lock_minutes int)
returns table(attempts int, locked_until timestamptz)
language plpgsql
as $$
declare
  v_attempts int;
  v_locked_until timestamptz;
begin
  insert into login_attempts (username, attempts, locked_until, last_attempt)
  values (p_username, 1, null, now())
  on conflict (username) do update
    set attempts = login_attempts.attempts + 1,
        last_attempt = now()
  returning login_attempts.attempts into v_attempts;

  if v_attempts >= p_max_attempts then
    update login_attempts
    set locked_until = now() + (p_lock_minutes || ' minutes')::interval
    where username = p_username
    returning login_attempts.locked_until into v_locked_until;
  end if;

  return query select v_attempts, v_locked_until;
end;
$$;
