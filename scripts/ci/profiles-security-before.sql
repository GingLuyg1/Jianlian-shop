-- ONLY on a disposable PostgreSQL database with synthetic users.
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000001','signup@example.invalid');
do $$ begin
  if not exists(select 1 from profiles where id='00000000-0000-4000-8000-000000000001' and role='user' and balance=0 and promotion_balance=0 and invite_code is not null) then raise exception 'NORMAL_SIGNUP_UNSAFE'; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
set request.jwt.claim.role='authenticated';
do $$ begin
  begin
    insert into profiles(id,role,balance) values(auth.uid(),'admin',999999);
    raise exception 'DUPLICATE_INSERT_ACCEPTED';
  exception when unique_violation then null; end;
end $$;
reset role;
-- Controlled missing-profile fixture; no real users and no Production writes.
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000002','missing@example.invalid');
delete from profiles where id='00000000-0000-4000-8000-000000000002';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
insert into profiles(id,role,balance,promotion_balance,account_status,risk_status)
values(auth.uid(),'admin',999999,999999,'active','normal');
do $$ begin
  if not public.is_admin(auth.uid()) then raise exception 'EXPECTED_ISOLATED_ESCALATION_NOT_REPRODUCED'; end if;
  if not exists(select 1 from profiles where id=auth.uid() and balance=999999 and promotion_balance=999999) then raise exception 'EXPECTED_ISOLATED_INJECTION_NOT_REPRODUCED'; end if;
end $$;
reset role;
delete from profiles where id='00000000-0000-4000-8000-000000000002';
select 'NORMAL_SIGNUP_SAFE=yes; MISSING_PROFILE_INSERT_EXPLOITABLE=yes; ADMIN_ESCALATION_EXPLOITABLE=yes; BALANCE_INJECTION_EXPLOITABLE=yes';
