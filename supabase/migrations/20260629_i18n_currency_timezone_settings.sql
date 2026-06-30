insert into public.site_settings (setting_key, setting_value, setting_type, setting_group, is_public, description)
values
  ('default_locale', jsonb_build_object('value','zh-CN'), 'string', 'store', true, 'Default display locale'),
  ('supported_locales', jsonb_build_object('value', jsonb_build_array('zh-CN')), 'json', 'store', true, 'Supported display locales'),
  ('business_timezone', jsonb_build_object('value','Asia/Shanghai'), 'string', 'store', true, 'Business reporting timezone'),
  ('date_format', jsonb_build_object('value','yyyy-MM-dd'), 'string', 'store', true, 'Date display format'),
  ('time_format', jsonb_build_object('value','HH:mm:ss'), 'string', 'store', true, 'Time display format')
on conflict (setting_key) do nothing;

