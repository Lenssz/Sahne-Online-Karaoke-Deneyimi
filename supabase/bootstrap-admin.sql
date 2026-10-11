-- Run only in the trusted Supabase SQL Editor after creating the Auth user.
-- Replace this address with the first administrator's confirmed email.
insert into public.admins(user_id)
select id from auth.users
where lower(email) = lower('ADMIN_EMAIL_HERE') and email_confirmed_at is not null
on conflict (user_id) do nothing;

-- Confirm one row is returned. No row means the email is absent or unconfirmed.
select a.user_id, u.email from public.admins a join auth.users u on u.id = a.user_id;
