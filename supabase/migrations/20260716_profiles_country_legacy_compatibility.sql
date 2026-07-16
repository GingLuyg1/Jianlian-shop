-- Add the legacy country field without assigning a country to existing users.
-- Current profile UI does not depend on this field, but older deployed database
-- functions and clients may still reference public.profiles.country.

do $$
declare
  v_data_type text;
begin
  if to_regclass('public.profiles') is null then
    raise exception 'profiles country compatibility requires public.profiles';
  end if;

  select c.data_type
  into v_data_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'profiles'
    and c.column_name = 'country';

  if found and v_data_type <> 'text' then
    raise exception 'public.profiles.country exists with incompatible type: %', v_data_type;
  end if;
end;
$$;

alter table public.profiles
  add column if not exists country text;

comment on column public.profiles.country is
  'Optional user country retained for compatibility; null means unspecified.';
