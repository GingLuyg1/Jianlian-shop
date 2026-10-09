set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
set request.jwt.claim.role='authenticated';
do $$ begin
  begin
    insert into profiles(id,role,balance,promotion_balance) values(auth.uid(),'admin',999999,999999);
    raise exception 'SENSITIVE_INSERT_ACCEPTED';
  exception when insufficient_privilege then null; end;
  begin
    insert into profiles(id) values(auth.uid());
    raise exception 'DIRECT_INSERT_ACCEPTED';
  exception when insufficient_privilege then null; end;
  if public.is_admin(auth.uid()) then raise exception 'MISSING_PROFILE_ADMIN_ESCALATED'; end if;
end $$;
reset role;
-- Signup trigger ignores untrusted authorization/financial claims.
set request.jwt.claim.sub='';
set request.jwt.claim.role='';
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000003','new@example.invalid','{"role":"admin","balance":999999,"promotion_balance":999999}');
insert into auth.users(id,email,raw_user_meta_data)
select '00000000-0000-4000-8000-000000000004','referral@example.invalid',jsonb_build_object('invite_code',invite_code) from profiles where id='00000000-0000-4000-8000-000000000001';
do $$ begin
  if not exists(select 1 from profiles where id='00000000-0000-4000-8000-000000000003' and role='user' and balance=0 and promotion_balance=0) then raise exception 'SIGNUP_DEFAULTS_FAILED'; end if;
  if not exists(select 1 from profiles where id='00000000-0000-4000-8000-000000000004' and referred_by='00000000-0000-4000-8000-000000000001')
    or not exists(select 1 from referrals where referred_user_id='00000000-0000-4000-8000-000000000004') then raise exception 'REFERRAL_SIGNUP_FAILED'; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';
set request.jwt.claim.role='authenticated';
update profiles set display_name='Safe edit',phone='12345678' where id=auth.uid();
do $$ begin
  if not exists(select 1 from profiles where id=auth.uid() and display_name='Safe edit') then raise exception 'SAFE_SELF_UPDATE_FAILED'; end if;
  begin
    update profiles set balance=99 where id=auth.uid();
    raise exception 'SENSITIVE_UPDATE_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set request.jwt.claim.sub='';
set request.jwt.claim.role='service_role';
set role service_role;
-- Same fixed defaults as verified-user server bootstrap, not client payload.
insert into profiles(id,email,role,balance,promotion_balance) values('00000000-0000-4000-8000-000000000002','missing@example.invalid','user',0,0);
update profiles set account_status='restricted' where id='00000000-0000-4000-8000-000000000002';
reset role;
insert into admin_users values('00000000-0000-4000-8000-000000000001','super_admin','active');
set request.jwt.claim.role='authenticated';
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
set role authenticated;
do $$ begin
  if not public.is_super_admin(auth.uid()) or (select count(*) from profiles) <> 4 then raise exception 'ADMIN_READ_ACCESS_FAILED'; end if;
end $$;
reset role;
do $$ begin
  if has_any_column_privilege('anon','public.profiles','INSERT') or has_any_column_privilege('authenticated','public.profiles','INSERT') then raise exception 'INSERT_ACL_REMAINED'; end if;
  if not has_table_privilege('service_role','public.profiles','INSERT') then raise exception 'SERVICE_INSERT_REVOKED'; end if;
end $$;
select 'PROFILE_SECURITY_POSTCHECK_PASS=yes; SIGNUP_PASS=yes; REFERRAL_PASS=yes; SAFE_UPDATE_PASS=yes; BOOTSTRAP_PASS=yes; SERVICE_ROLE_PASS=yes; ADMIN_READ_PASS=yes';
