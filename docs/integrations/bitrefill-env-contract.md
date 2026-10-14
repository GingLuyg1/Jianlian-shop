# Bitrefill environment contract (proposal; no variables created)

Date: 2026-10-14. Production write path is disabled. This document is not a deployment instruction.

| Name | Purpose | Handling |
| --- | --- | --- |
| `BITREFILL_API_KEY` | Personal API Bearer credential for approved read-only probe | Server-side secret only; never expose via `NEXT_PUBLIC_*`; optional when not probing. |
| `BITREFILL_API_ID` | Business Basic username | Server-side secret, paired with `BITREFILL_API_SECRET`; approval pending. |
| `BITREFILL_API_SECRET` | Business Basic password | Server-side secret, rotated with API ID where provider supports it. |
| `BITREFILL_AUTH_MODE` | Proposed selection `personal` or `business` | Explicit mode; no implicit fallback between credentials. Existing client accepts this as an input, but no deployment wiring is added here. |
| `BITREFILL_PURCHASE_ENABLED` | Proposed emergency purchase gate | Future server-side flag, default `false`; currently **not implemented** as a production switch. Active route remains Daju-only. |

The existing client defaults to `https://api.bitrefill.com/v2` and enforces HTTPS for any explicitly supplied base URL. Never redirect credentials to a test host in production. Keep timeout and retry policy in reviewed server configuration, not user-controlled request parameters. Business and Personal authentication share the same catalog parser and bounds. No live secrets were available in this task; no variable was set, rotated or copied. `LIVE_MAPPING_PENDING` and `COST_DATA_UNAVAILABLE` remain the honest status.

Secrets must be excluded from snapshots, errors, webhook receipts, customer responses, metrics labels and support exports. Credential rotation: stage new secret, GET-only check with purchase closed, switch reference, revoke old, verify, audit. A failed rotation leaves purchase closed. The webhook has no documented signing mechanism in the reviewed V1.1 references; do not add a fictional webhook-signing secret or trust the body as fulfillment evidence.
