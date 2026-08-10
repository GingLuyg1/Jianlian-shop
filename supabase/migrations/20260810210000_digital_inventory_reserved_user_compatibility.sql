-- Restore the digital inventory reservation owner column required by
-- reserve_local_inventory_for_daju_order(). The authoritative definition is
-- 20260709_digital_delivery_reserved_fulfillment_hardening.sql.

alter table public.digital_inventory
  add column if not exists reserved_user_id uuid;
