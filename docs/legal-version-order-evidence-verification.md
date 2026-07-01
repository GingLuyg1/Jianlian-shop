# Legal Version and Order Evidence Verification

Date: 2026-07-01

## Existing protocol structure
- Public checkout previously had a client-side confirmation checkbox, but server-side order creation did not require a concrete legal version.
- Existing order rows did not preserve the legal document version confirmed at purchase time.
- Historical orders without agreement records must remain visible and must be marked as missing evidence instead of being backfilled.

## Added migration
Manual SQL file:

- `supabase/migrations/20260701_legal_documents_order_evidence.sql`

It creates:

- `legal_documents`: versioned legal documents with `document_type`, `version`, `content_hash`, `status`, `effective_at`, `published_at`, and publisher metadata.
- `order_agreement_acceptances`: immutable order-level acceptance records with server-generated `accepted_at`, request id, user-agent summary, and hashed IP only.
- `order_evidence_events`: server-written evidence events for agreement confirmation and future order evidence.

## Checkout confirmation flow
- Checkout fetches `/api/legal/current`.
- Required documents are `terms_of_service`, `refund_policy`, `digital_delivery_policy`, and `purchase_notice`.
- The checkbox is not auto-selected.
- The create-order request submits only document version ids and content hashes.
- `app/api/orders/route.ts` verifies that submitted versions still exist, are published, are effective, and match hashes.

## Server-side validation
- `lib/legal/legal-service.ts` centralizes published-document lookup, hash generation, agreement verification, request id generation, IP hashing, and acceptance writing.
- Frontend `accepted_at`, user id, and IP are not trusted.
- Service role is used only server-side to write evidence rows; direct browser writes are denied by RLS.

## Order snapshots
- Existing order creation already stores product name, slug, image URL, unit price, line total, delivery type, SKU fields, and `product_snapshot`/`option_snapshot` where available.
- Historical product or SKU changes do not mutate already saved order item snapshots.
- This task does not rewrite old orders.

## Admin evidence query
- Admin order relation loading is intended to include agreement/evidence rows as part of order evidence. If a historical order has no agreement records, the UI should label it as historical missing evidence rather than fabricating acceptance.

## Security results
- Published legal documents can be read publicly.
- Draft and archived management is admin-only.
- Agreement/evidence tables are read-only for owners/admins and write-denied for normal authenticated clients.
- No full IP, payment secrets, provider raw callbacks, or digital inventory secrets are stored in agreement records.

## Required manual migration
1. `supabase/migrations/20260701_legal_documents_order_evidence.sql`
2. Insert or publish the first effective versions for all required checkout document types.

## Remaining items
- To make order creation and agreement insert a single database transaction, the existing `create_order_with_item` RPC should be extended in a follow-up migration to accept verified agreement ids. The current implementation verifies before order creation and writes evidence immediately after creation in the same server request.
