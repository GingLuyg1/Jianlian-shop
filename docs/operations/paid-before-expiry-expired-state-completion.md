# Paid-before-expiry / expired-local-state completion repair

Base: integration ff28da2d95f6a86df668279619527927b452f37a, not main.
Production inspection was read-only. No real Provider request or canary repair.

Three blockers were confirmed: the session RPC, recharge RPC and downstream
legacy credit function reject expired. The existing credit four-argument API
also allows authenticated admins; removing its expired guard would be unsafe.

This forward migration preserves that legacy function byte-for-byte and adds
a service-role-only five-argument credit overload with explicit trusted paid_at.
The canonical recharge RPC calls that overload. Its four-argument compatibility
wrapper still rejects expired, even for prematurely-expired rows.

Expired rescue requires finite explicit paid_at, non-null created/expiry bounds,
one linked recharge session, matching ownership/provider/channel/business identity,
allowed states, both lifetimes, five-minute future bound, frozen amount/currency,
unique Provider transaction, no existing credit and the trusted server role.
Closed/failed/refunded and expired ordinary orders remain blocked. Genuine
after-expiry payment still requires the separate late-payment review path.

Lock ordering is session(s) in UUID order, recharge, then profile. All writes
remain inside canonical atomic completion; no pending-state repair or side-channel
fund writes are used. A second identical completion remains idempotent.

Preflight matches exact audited function-definition hashes (LF-normalized), owner,
ACL, SECURITY DEFINER and search_path. Unknown baselines abort before any DDL.
Postcheck verifies security/ACL and guards; legacy authenticated/admin credit ACL
is preserved, never newly granted to the trusted overload. No migration-time row
UPDATE/backfill is executed. SQL INSERT/UPDATE in function bodies run only when
the separately authorized canonical completion is invoked later.

Production rollout requires separate migration authorization after review/CI.
No app code change/deploy is required for this DB boundary. Keep Alipay/WeChat
closed and leave the real third canary untouched in this development task.
Callback delivery remains a distinct unresolved incident.
