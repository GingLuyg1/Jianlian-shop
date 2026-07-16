-- Seed baseline published legal documents for checkout/order agreement validation.
-- Execute manually after 20260701_legal_documents_order_evidence.sql.
-- Safe to rerun. Does not modify orders, payments, products, or users.

do $$
begin
  if to_regclass('public.legal_documents') is null then
    raise exception 'public.legal_documents is missing. Execute 20260701_legal_documents_order_evidence.sql first.';
  end if;
end $$;

with seed(document_type, version, title, content, content_hash) as (
  values
    (
      'terms_of_service',
      'test-2026-07-09',
      'Test Terms of Service',
      'Test terms of service for Jianlian Shop test environment. The user confirms the order information and agrees to follow applicable platform rules.',
      '0c75dc6be89dc4389da9856e14262ca50a26d00b701228c58d409a66e85e3893'
    ),
    (
      'refund_policy',
      'test-2026-07-09',
      'Test Refund Policy',
      'Test refund policy for Jianlian Shop test environment. Digital goods may have refund restrictions after delivery and each request is reviewed by order status.',
      'c6856bc508b8c42dd0c0a5ab938bdb58f6d0d12ebf376fc3592729e5aaf1271a'
    ),
    (
      'digital_delivery_policy',
      'test-2026-07-09',
      'Test Digital Delivery Policy',
      'Test digital delivery policy for Jianlian Shop test environment. Digital goods are delivered through the system after successful payment validation.',
      'de4e60de772e906ceb5c231c03d97ea4fe3f714984d9c791347167cff78e517a'
    ),
    (
      'purchase_notice',
      'test-2026-07-09',
      'Test Purchase Notice',
      'Test purchase notice for Jianlian Shop test environment. Please verify product, SKU, quantity, contact email, payment method, and inventory before submitting an order.',
      '84c6f730853b366ee3ef4eabf8d93ac53a3cfaa866db7b05d2dcc7dc6b086147'
    )
),
archive_existing as (
  update public.legal_documents doc
     set status = 'archived',
         updated_at = now()
    from seed
   where doc.document_type = seed.document_type
     and doc.status = 'published'
     and doc.version <> seed.version
  returning doc.id
)
insert into public.legal_documents (
  document_type,
  version,
  title,
  content,
  content_hash,
  status,
  effective_at,
  published_at,
  published_by,
  publish_reason,
  updated_at
)
select
  seed.document_type,
  seed.version,
  seed.title,
  seed.content,
  seed.content_hash,
  'published',
  now(),
  now(),
  null,
  'Seeded for Jianlian-shop-test checkout integration',
  now()
from seed
on conflict (document_type, version) do update
set title = excluded.title,
    content = excluded.content,
    content_hash = excluded.content_hash,
    status = 'published',
    effective_at = coalesce(public.legal_documents.effective_at, excluded.effective_at),
    published_at = coalesce(public.legal_documents.published_at, excluded.published_at),
    published_by = public.legal_documents.published_by,
    publish_reason = excluded.publish_reason,
    updated_at = now();
