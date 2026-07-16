# Administrator permission model

`admin_users` is the authoritative administrator authorization source. `profiles.role = 'admin'` remains a temporary ordinary-admin compatibility fallback only when that user has no `admin_users` row. It never grants super-admin access.

| Capability | admin | super_admin | service_role |
| --- | --- | --- | --- |
| Product/category management | Allowed | Allowed | Controlled server use |
| Order and payment read | Allowed | Allowed | Controlled server use |
| User balance/status/risk changes | Denied | Allowed with reason and audit | Recovery only |
| Refund decisions/external completion | Denied | Allowed with reason and audit | Recovery only |
| Privacy anonymization | Denied | Allowed with reason and audit | Wrapper only |
| Administrator authorization | Denied | Allowed; self/last-super protection | Controlled bootstrap/recovery |
| Full audit/integrity checks | Denied | Allowed | Controlled server use |
| Compensation/data-consistency writes | Denied | Allowed | Internal processing |
| Email template/job writes | Denied | Allowed | Internal delivery |
| Media write/delete flags | Denied | Allowed | Controlled server use |

## Bootstrap

The migration imports existing `profiles.role = 'admin'` users as ordinary active admins. It deliberately creates no super administrator. A reviewed operator must appoint the first super administrator by UUID using the commented template in `docs/admin-users-super-admin-verification.sql`.

## Compatibility removal

After every environment has `admin_users` populated and all administrator login paths have been verified, remove the `profiles.role` fallback from `public.is_admin(uuid)`, `requireApiAdmin()`, and `getServerAdminContext()` in a separate release. Keep `profiles.role` only as profile compatibility data until its consumers are audited.
