-- DO NOT EXECUTE WITHOUT SEPARATE PRODUCTION AUTHORIZATION
-- Atomically promotes one draft email template while preserving the previous current template on failure.

create or replace function public.publish_email_template_atomic(
  p_template_id uuid,
  p_admin_id uuid
)
returns setof public.email_templates
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_template_code text;
  v_target public.email_templates;
begin
  if auth.role() <> 'service_role' then
    raise exception 'EMAIL_TEMPLATE_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_admin_id is null or not public.is_super_admin(p_admin_id) then
    raise exception 'EMAIL_TEMPLATE_SUPER_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select template_code
    into v_template_code
  from public.email_templates
  where id = p_template_id;

  if v_template_code is null then
    raise exception 'EMAIL_TEMPLATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('email_template:' || v_template_code, 0));

  perform 1
  from public.email_templates
  where template_code = v_template_code
  order by id
  for update;

  select *
    into v_target
  from public.email_templates
  where id = p_template_id;

  if v_target.id is null then
    raise exception 'EMAIL_TEMPLATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_target.status <> 'draft' then
    raise exception 'EMAIL_TEMPLATE_NOT_DRAFT' using errcode = '22023';
  end if;

  if nullif(btrim(v_target.subject_template), '') is null
     or nullif(btrim(v_target.html_template), '') is null then
    raise exception 'EMAIL_TEMPLATE_REQUIRED_FIELDS_MISSING' using errcode = '22023';
  end if;

  if v_target.html_template ~* '<[[:space:]]*(script|iframe|object|embed|form|base|meta)[[:space:]>]'
     or v_target.html_template ~* '[[:space:]]on[a-z]+[[:space:]]*='
     or v_target.html_template ~* '(javascript[[:space:]]*:|data[[:space:]]*:[[:space:]]*text/html[[:space:]]*:)' then
    raise exception 'EMAIL_TEMPLATE_HTML_UNSAFE' using errcode = '22023';
  end if;

  update public.email_templates
     set is_current = false,
         updated_by = p_admin_id
   where template_code = v_template_code
     and is_current = true;

  update public.email_templates
     set status = 'published',
         is_current = true,
         published_at = now(),
         published_by = p_admin_id,
         archived_at = null,
         updated_by = p_admin_id
   where id = p_template_id
   returning * into v_target;

  return next v_target;
  return;
end;
$$;

revoke all on function public.publish_email_template_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.publish_email_template_atomic(uuid, uuid) to service_role;
