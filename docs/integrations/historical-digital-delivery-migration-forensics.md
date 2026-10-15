# Historical digital-delivery migration forensics (local evidence only)

Decision: **RECONSTRUCTION_TRUSTED=no**. Do not generate a replay override from this evidence. This document is not a migration or a Production repair plan.

## Provenance and limits

- Target: `supabase/migrations/20260622_digital_delivery_hardening.sql`; SHA-256 `2ff47dbbb596469b4b16e1e4112839f9221e801b7c36450ede47cb93fedc753f` at source HEAD `532bd22f5c4441ecb4adec7c8bbca094fd445580`.
- `git log --follow -p` and `git rev-list --all -- <path>` find only introduction commit `35138bd834aa86224558c1930924d1532e972ecf`. Its blob ID `b73c5b99ca81d5ef4f602ac5d989ed7fe7e8c5f9` equals the HEAD blob. The parent has no file. There is no last-known-good version of this file in reachable Git history.
- The file is UTF-8 decodable. Mojibake and missing closing quotes are already present at introduction. Git evidence does **not** identify whether conversion, a manual edit, or another pre-commit event caused the damage.
- No Production schema connection was used. Current Production state, if any, cannot prove the 2026-06-22 intended text. No database object or repository migration was changed.

## Object inventory

The file attempts 42 distinct extension/table/column/constraint/index/policy/trigger/function changes, plus RLS state and privilege statements. This is an inventory of intended DDL, **not** proof that the broken file ever applied.

| Class | Count | Objects or changes |
| --- | ---: | --- |
| Extension | 1 | `pgcrypto` |
| Tables | 2 | `public.digital_delivery_secrets`, `public.delivery_logs` |
| Added columns | 11 | `digital_inventory`: `content_type`, `reserved_order_id`, `delivered_order_id`, `delivered_user_id`; `order_deliveries`: `user_id`, `product_id`, `inventory_id`, `encrypted_content`, `viewed_at`, `failure_reason`, `delivery_note` |
| Replaced constraints | 2 | `digital_inventory_status_check`, `order_deliveries_status_check` |
| Indexes | 8 | `digital_inventory_{reserved_order,delivered_order,delivered_user}_idx`; `order_deliveries_{user,inventory}_idx`, `order_deliveries_delivered_inventory_uidx`; `delivery_logs_{order,inventory}_idx` |
| Policies | 4 | Two deny-direct-access policies on `digital_delivery_secrets`; admin-read and deny-direct-write policies on `delivery_logs` |
| Triggers | 2 | `digital_delivery_secrets_set_updated_at`, `order_deliveries_protect_content` |
| Functions | 12 | `protect_order_delivery_content`, `mask_delivery_secret`, `write_delivery_log`, `sync_product_available_stock`, `release_order_inventory`, `deliver_digital_order`, `auto_deliver_order`, `admin_retry_auto_delivery`, `admin_update_order_status`, `get_order_delivery_for_user`, `admin_list_digital_inventory_summary`, `admin_list_digital_inventory_items` |

The file also enables RLS on both new tables, migrates legacy `order_deliveries.delivery_content` into private secrets, updates inventory/order rows, revokes `anon` execution on two functions, and grants `authenticated` execution on four functions. Existing inventory and delivery tables are altered, not created here.

## Parser and lexical classification

The 25 listed suspect lines were checked against local loopback PostgreSQL 17.11 using **SELECT-only** fragment probes. To avoid Windows command-line client-encoding corruption, each fragment's non-ASCII characters were replaced by ASCII `x` while preserving every quote, comma, semicolon, parenthesis, and other ASCII SQL syntax byte. Twenty-two probes returned `unterminated quoted string`; lines 328, 342, and 483 instead failed at the following `'{}'` token because the damaged quote changes token boundaries. These are syntax/lexical failures, not merely unattractive output. The earlier full-file disposable replay independently stopped at line 188 on the first damaged function (source line 184). Fragment probes show the defect class; they do not validate any reconstructed replacement.

Seven other non-ASCII lines (206, 215, 339, 604, 642, 675, 698) contain complete quoted literals. Corresponding normalized literal probes parsed as SQL; these are **VALID_SQL_WITH_MOJIBAKE** for syntax classification only. They were not decoded or rewritten. Thus, among 32 non-ASCII lines: 25 syntax-broken, seven syntactically valid mojibake, zero unclassified by this limited lexical test. The 25 requested suspect lines are all syntax-broken.

## Object-to-later-definition evidence

| Object | Later repository evidence | Important qualification |
| --- | --- | --- |
| `mask_delivery_secret` | `20260623_mixed_order_item_fulfillment.sql:143`, `20260703_digital_delivery_atomic_hardening.sql:176`, `20260709_digital_delivery_reserved_fulfillment_hardening.sql:171` | First two return em dash for null/empty; July 9 returns hyphen. Short/long formulas agree. No unambiguous original empty value. |
| `write_delivery_log` / `delivery_logs` | July 3 migration lines 75, 217; July 9 lines 106, 184; `lib/delivery/delivery-service.ts:120` | Original body is syntactically intact, but later definitions change access and scrub detail keys. Do not transplant a later body into June 22. |
| Private secret table / protection | June 23 lines 76-96, July 3 lines 53-73, July 9 lines 84-104; `tests/regression/source-contract.test.mjs:1519` | Later migrations repeat RLS/private-table creation. The June 22 trigger is not redefined later by name. |
| `digital_inventory`, `order_deliveries` | June 23 lines 98-109, July 3 lines 7-39, July 9 lines 17-70 | Later schemas add item/SKU fulfillment and revise statuses; later shape is not June 22 equivalence. |
| `deliver_digital_order` | June 23 line 314, June 29 line 462, July 3 line 341, July 9 line 339; `tests/regression/source-contract.test.mjs:1716-1721` | Repeated replacement significantly changes failure/idempotency behavior. |
| `release_order_inventory`, `admin_update_order_status` | Earlier June 20 lines 327 and 646; later lifecycle replacements July 9/10 | Earlier error strings help but do not prove all June 22 changes. |
| `get_order_delivery_for_user` | June 23 line 561, July 3 line 700, July 9 line 616, July 23 line 120, August 10 line 109; `app/api/orders/[orderNo]/delivery/route.ts` | User-facing RPC and private-secret join remain an application contract; implementation evolves. |
| Admin inventory list RPCs | Earlier June 20 lines 88/157, later October 6 v2 item list line 720; `app/api/admin/inventory/route.ts`; `tests/unit/admin-inventory-rpc-source-contract.test.mjs` | Later v2 is not a byte-equivalent historical definition. |

`write_delivery_log` in the target file takes `(uuid, uuid, uuid, text, text, text, jsonb)` with defaults after the first argument. It is `SECURITY DEFINER` with `search_path=public`, requires non-null `auth.uid()`, checks order ownership for non-admin callers, records `auth.uid()` and admin/system type, truncates message to 500 characters, and stores `p_detail` **without** secret-key filtering. Its own error-message literals at lines 206/215 are syntactically valid mojibake. The later July 9 version removes sensitive keys from detail; that change cannot be retroactively attributed to June 22. Callers and regression tests establish a logging contract but do not assert the original corrupted message bytes or justify inserting secrets into audit rows.

## Reconstruction matrix

`Broken text` describes the exact structural failure, with the immutable source line as the byte-authoritative text. Candidate entries are only the affected literal, **not** approval to generate SQL. `HIGH` means direct context agrees across sources; it still does not make the entire file trusted. `—` means no literal can be asserted without guessing. The later sources may be behavior-changing replacements.

| Line | Object | Broken text | Evidence 1 | Evidence 2 | Reconstructed SQL fragment | Confidence | Resolved |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 184 | `mask_delivery_secret` | `then '閳?` no closing quote | June 23:149 returns `'—'` | July 9:178 returns `'-'` | — (conflicting empty-value semantics) | LOW | no |
| 272 | `release_order_inventory` | `RAISE EXCEPTION '<mojibake>?;` | June 20:341 same guard | Later July 9/10 function changes | — (only earlier exact text) | MEDIUM | no |
| 319 | `deliver_digital_order` | admin error literal unclosed | June 20:379 | June 23:334 | `'无后台访问权限'` | HIGH | yes |
| 328 | `deliver_digital_order` | missing-order audit literal runs into `'{}'` | June 23:339 raises `订单不存在` | July 3:374 returns a different failure shape | — (audit wording not proven) | LOW | no |
| 329 | `deliver_digital_order` | missing-order exception unclosed | June 20:388 | June 23:339 | `'订单不存在'` | HIGH | yes |
| 333 | `deliver_digital_order` | unpaid-order audit literal unclosed | June 23:343 exception | July 3:378 return message | — (audit wording not proven) | LOW | no |
| 334 | `deliver_digital_order` | unpaid-order exception unclosed | June 23:343 | July 3:378 | `'订单未支付，不能发货'` | HIGH | yes |
| 338 | `deliver_digital_order` | cancelled-order audit literal unclosed | Target line 339 is a valid but garbled exception literal | June 23:347 changes text | — (audit wording not proven) | LOW | no |
| 342 | `deliver_digital_order` | started-log literal runs into `'{}'` | July 3:385 says `自动交付开始` | July 9:382 uses English wording | — (versions differ) | MEDIUM | no |
| 461 | `deliver_digital_order` | failed-delivery `failure_reason` unclosed | June 23:417 | July 3:495 | `'库存不足，等待人工处理'` | HIGH | yes |
| 466 | `deliver_digital_order` | failed-delivery log literal unclosed | July 3:512 same event | June 23:417 failure reason | `'库存不足，等待人工处理'` | HIGH | yes |
| 473 | `deliver_digital_order` | `admin_note` suffix unclosed | June 20:737 has a shorter note | June 23 drops this path | — | LOW | no |
| 476 | `deliver_digital_order` | insufficient-stock exception unclosed | June 20:453 raises another text | June 23 converts to per-item failure | — | LOW | no |
| 483 | `deliver_digital_order` | no-auto-item audit literal runs into `'{}'` | June 23:434-436 returns idempotently | July 3:525 returns message | — (behavior differs) | LOW | no |
| 484 | `deliver_digital_order` | no-auto-item exception unclosed | June 23:434-436 | July 3:525 | — (later versions do not raise) | LOW | no |
| 502 | `deliver_digital_order` | status-log note unclosed | June 20:474 `自动发货完成` | July 3:546 `自动交付处理完成` | — (different notes) | LOW | no |
| 507 | `deliver_digital_order` | success-log message unclosed | July 3:537 `自动交付完成` | June 20:474 `自动发货完成` | — (different messages) | LOW | no |
| 541 | `admin_retry_auto_delivery` | admin exception unclosed | June 20:755 | June 23:334 analogous admin guard | `'无后台访问权限'` | HIGH | yes |
| 566 | `admin_update_order_status` | admin exception unclosed | June 20:663 | June 20:755 repeated same guard | `'无后台访问权限'` | HIGH | yes |
| 571 | `admin_update_order_status` | missing-order exception unclosed | June 20:668 | June 23:339 | `'订单不存在'` | HIGH | yes |
| 577 | `admin_update_order_status` | invalid-status exception unclosed | June 20:674 same function/condition | Status allow-list preserved in target | `'无效订单状态'` | HIGH | yes |
| 685 | `get_order_delivery_for_user` | access-denied exception unclosed | June 23:585 | July 3:724 | `'订单不存在或无权查看'` | HIGH | yes |
| 689 | `get_order_delivery_for_user` | unpaid exception unclosed | June 23:586 | July 3:725 | `'订单未支付'` | HIGH | yes |
| 752 | `admin_list_digital_inventory_summary` | admin exception unclosed | June 20:118 same function/guard | June 20:189 list sibling | `'无后台访问权限'` | HIGH | yes |
| 823 | `admin_list_digital_inventory_items` | admin exception unclosed | June 20:189 same function/guard | June 20:118 list sibling | `'无后台访问权限'` | HIGH | yes |

Unresolved lines: **184, 272, 328, 333, 338, 342, 473, 476, 483, 484, 502, 507**. The mask empty-value ambiguity alone is a critical blocker. There is no evidence-based right to substitute a generic error message, a later changed branch, or a guessed Chinese repair merely to make a parser pass. No compatibility copy, replay diff, or SQL apply was generated.

## Decision and next evidence

`MASK_DELIVERY_SECRET_RESOLVED=no` for null/empty; the target's short/long formulas are legible and agree with June 23/July 3/July 9. `WRITE_DELIVERY_LOG_RESOLVED=yes` for its signature, guard, ownership, write shape and syntactic validity; its mojibake text remains untouched. `ALL_CRITICAL_SEGMENTS_RESOLVED=no` and `RECONSTRUCTION_TRUSTED=no`.

To proceed, obtain an independently preserved original SQL/source artifact or a separately authorized, explicitly **non-equivalent** local bootstrap contract with reviewed replacement behavior for every unresolved line. A read-only Production catalog snapshot may clarify current functions but is not historical proof by itself. Do not edit the deployed historical migration, infer Production's schema from this repository file, or start V1.3 DB3 replay from this document alone.
