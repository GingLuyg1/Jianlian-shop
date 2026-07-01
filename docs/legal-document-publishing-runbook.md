# Legal Document Publishing Runbook

Date: 2026-07-01

## Manual setup
1. Execute `supabase/migrations/20260701_legal_documents_order_evidence.sql` in Supabase SQL Editor.
2. Open `/admin/settings/legal` as a super administrator.
3. Create drafts for:
   - `terms_of_service`
   - `privacy_policy`
   - `refund_policy`
   - `digital_delivery_policy`
   - `purchase_notice`
4. Publish at least the four checkout-required documents before accepting new orders.

## Publishing rules
- Published content is immutable in practice: edit by creating a new draft and publishing a new version.
- Publishing a new version archives the previous published version for the same document type.
- Publishing requires a reason and writes an administrator audit log.
- Historical orders keep referencing the original document version and content hash.

## Safety rules
- Do not backfill historical acceptance timestamps.
- Do not use current legal text as historical evidence for old orders.
- Do not delete legal versions referenced by orders.
- Do not expose SQL execution or secret values in the legal management UI.

## Rollback
- If a published version is wrong, publish a corrected new version and archive the wrong one.
- Existing orders that referenced the wrong version remain factual records and should be handled with an admin note, not overwritten.
