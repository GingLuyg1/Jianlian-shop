# Risk Review Runbook

## Access

Risk review is available at:

- `/admin/risk`
- `/admin/risk/[id]`

Only the configured super administrator can use the API. Regular admins and normal users receive `403`.

## Review Actions

| Action | Meaning | Business impact |
| --- | --- | --- |
| Approve | Risk was reviewed and the business flow may continue through existing services. | Does not directly modify orders, payments, refunds, balances, or inventory. |
| Reject | Risk is confirmed and the related business flow should not continue automatically. | Records the decision only. |
| Monitor | Keep event open for observation. | No direct business mutation. |
| Release | Mark a false positive or expired restriction as resolved. | Restores normal future flow by clearing the risk event state only. |

Every action requires a reason. High and critical events require a browser confirmation before submission.

## False Positive Recovery

1. Open the risk event detail page.
2. Confirm the event summary, rule code, business type, and sanitized metadata.
3. Choose `解除限制`.
4. Enter a reason explaining why the signal was a false positive.
5. Submit. The event remains in history with status `resolved`; it is not deleted.

## Operational Rules

- Do not edit orders, balances, payments, refunds, or delivery records from the risk page.
- Use existing order/refund/payment admin tools for business processing after a review decision.
- Never paste raw payment callbacks, full IP addresses, passwords, tokens, secret keys, or digital inventory content into the review reason.
- If risk tables are missing, execute `supabase/migrations/20260701_risk_events_reviews.sql` manually through the approved migration process.

## Incident Handling

| Symptom | Action |
| --- | --- |
| Risk center shows migration missing | Run the risk events Migration manually; do not deploy SQL from the app. |
| Payment session creation blocked | Check matching risk event, then approve or release if false positive. |
| Refund event for delivered digital goods | Review delivery status and refund policy before processing in refund admin. |
| Repeated event count rising | Keep monitoring or reject; investigate source hash and business ID patterns. |
| Audit log failure after review | Treat as incomplete operation and ask engineering to verify `admin_audit_logs`. |

## Manual Acceptance Checklist

- Normal user cannot open `/admin/risk`.
- Super admin can filter by risk level, rule, business type, and status.
- Review reason is required.
- High-risk action requires a second confirmation.
- Approve, reject, monitor, and release create `risk_reviews` rows.
- Risk review actions create admin audit logs.
- No page exposes full IP, token, provider callback payload, or digital inventory content.
