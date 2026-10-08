-- Forward-only contract alignment. No session/backfill/funds changes.
-- Application already defines deeplink; preserve every existing legal value.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.payment_sessions
  DROP CONSTRAINT payment_sessions_payment_type_check;
ALTER TABLE public.payment_sessions
  ADD CONSTRAINT payment_sessions_payment_type_check
  CHECK (payment_type IN ('redirect', 'qrcode', 'address', 'deeplink'));

COMMIT;
