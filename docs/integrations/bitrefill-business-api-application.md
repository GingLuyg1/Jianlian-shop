# Bitrefill Business API application packet and open questions

Status: draft for business/security review; **not submitted**. Date: 2026-10-14.

## Applicant packet to prepare

- Jianlian legal entity, registration jurisdiction/number, public storefront URL, authorized business contact and technical/security contact.
- Expected product categories/countries, projected monthly order count and value, initial fixed-denomination pilot size, funding/payment method and settlement currency. These figures require business owner approval; none are invented here.
- Data flow: server-side credential storage; read-only catalog sync; paid-order frozen product/package/quote; one durable purchase attempt; authenticated invoice/order GET; private redemption in `digital_delivery_secrets`; ID-only webhook wake-up. No card codes in logs.
- Security: least-privilege operations, purchase kill switch, unique attempt/order constraints, credential rotation, redaction, incident contact and retention schedule. Provide diagrams/policy evidence only after security review.
- Regulatory/contract review of gift-card resale, country restrictions, tax, refunds, customer support and provider terms before enabling any SKU.

## Questions for Bitrefill

1. Which Business API scopes and approval steps enable catalog GET, invoice POST and invoice/order GET? Can read and write credentials be separated?
2. Is a merchant reference or native idempotency key supported for `POST /invoices`? What is the official behavior after a POST timeout with no invoice ID? Obtain a written answer; current review found none documented.
3. What are the exact fixed-package identifiers, currency, quoted cost, price validity window, and availability semantics for each country? How are package renames/removals surfaced?
4. Does one invoice product quantity produce one external order per unit? Are order IDs stable and always present in invoice GET? What are the partial/refund semantics?
5. What authenticated webhook signing, replay protection, retry schedule or source allowlisting is officially supported? Current implementation assumes none and trusts only GET.
6. What are production/sandbox endpoints, quotas, 429 reset semantics, reconciliation retention and support escalation SLAs?
7. What credentials/funding are needed for a single authorized canary; how can payment or purchase be disabled immediately?

## Offline candidate targets only

Apple US existing Jianlian USD face values: **2, 3, 4, 5, 10, 15, 20, 25, 50, 100**. These ten SKUs are matching targets, not discovered Bitrefill packages, available stock, or verified costs. No credential was present, so no live mapping, price, FX or profit computation was performed: `LIVE_MAPPING_PENDING`, `COST_DATA_UNAVAILABLE`. Keep supplier bindings unchanged until each exact product/package/currency/face and commercial permission is verified.
