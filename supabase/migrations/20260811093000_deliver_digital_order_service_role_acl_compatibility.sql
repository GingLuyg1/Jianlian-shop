-- Restore the service-role-only EXECUTE contract established by the digital
-- delivery security hardening migrations. Function owners retain their normal
-- PostgreSQL owner privileges; this migration changes no function definition.

begin;

revoke execute on function public.deliver_digital_order(uuid,text) from public;
revoke execute on function public.deliver_digital_order(uuid,text) from anon;
revoke execute on function public.deliver_digital_order(uuid,text) from authenticated;
grant execute on function public.deliver_digital_order(uuid,text) to service_role;

commit;
