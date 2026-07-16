-- Keep account anonymization compatible with deployed profiles schemas.
-- Execute after 20260715_admin_users_super_admin_model.sql.

do $$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.privacy_requests') is null
     or to_regclass('public.privacy_request_events') is null then
    raise exception 'privacy anonymization compatibility requires profiles and privacy request tables';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'id'
  ) then
    raise exception 'privacy anonymization compatibility requires profiles.id';
  end if;
  if to_regprocedure('public.super_admin_anonymize_user_account(uuid,uuid,text)') is null then
    raise exception 'privacy anonymization compatibility requires the super-admin authorization migration';
  end if;
end;
$$;

create or replace function public.anonymize_user_account(
  p_request_id uuid,
  p_admin_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_request public.privacy_requests%rowtype;
  v_marker text;
  v_set_clauses text[] := array[]::text[];
  v_column text;
  v_profile_rows integer;
begin
  select * into v_request
  from public.privacy_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'PRIVACY_REQUEST_NOT_FOUND'; end if;
  if v_request.request_type <> 'account_deletion' then raise exception 'PRIVACY_REQUEST_TYPE_INVALID'; end if;
  if v_request.status not in ('approved', 'processing') then raise exception 'PRIVACY_REQUEST_STATUS_INVALID'; end if;
  if v_request.user_id is null then raise exception 'PRIVACY_REQUEST_USER_MISSING'; end if;

  v_marker := 'deleted-' || replace(v_request.user_id::text, '-', '') || '@anonymous.invalid';

  for v_column in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name in (
        'email', 'display_name', 'phone', 'country', 'avatar_url',
        'recipient_name', 'shipping_address', 'account_status', 'deleted_at',
        'anonymized_at', 'deletion_requested_at', 'updated_at'
      )
  loop
    v_set_clauses := array_append(v_set_clauses,
      case v_column
        when 'email' then format('%I = $1', v_column)
        when 'display_name' then format('%I = $2', v_column)
        when 'account_status' then format('%I = $3', v_column)
        when 'deletion_requested_at' then format('%I = coalesce(%I, $4)', v_column, v_column)
        when 'shipping_address' then format('%I = ''{}''::jsonb', v_column)
        when 'deleted_at' then format('%I = now()', v_column)
        when 'anonymized_at' then format('%I = now()', v_column)
        when 'updated_at' then format('%I = now()', v_column)
        else format('%I = null', v_column)
      end
    );
  end loop;

  if coalesce(array_length(v_set_clauses, 1), 0) = 0 then
    raise exception 'PRIVACY_PROFILE_ANONYMIZATION_FIELDS_MISSING';
  end if;

  execute format(
    'update public.profiles set %s where id = $5',
    array_to_string(v_set_clauses, ', ')
  ) using v_marker, '已注销用户', 'disabled', v_request.created_at, v_request.user_id;

  get diagnostics v_profile_rows = row_count;
  if v_profile_rows <> 1 then raise exception 'PRIVACY_PROFILE_NOT_FOUND'; end if;

  update public.privacy_requests
  set status = 'completed', completed_at = now(), reviewed_by = p_admin_id,
      reviewed_at = coalesce(reviewed_at, now()), review_note = coalesce(p_reason, review_note), updated_at = now()
  where id = p_request_id;

  insert into public.privacy_request_events(
    request_id, user_id, actor_type, actor_id, event_type, message, metadata
  ) values (
    p_request_id, v_request.user_id, 'admin', p_admin_id, 'account_anonymized',
    '账号资料已匿名化，历史订单和资金记录按规则保留。',
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('ok', true, 'user_id', v_request.user_id, 'anonymous_email', v_marker);
end;
$$;

revoke all on function public.anonymize_user_account(uuid,uuid,text)
from public, anon, authenticated, service_role;
