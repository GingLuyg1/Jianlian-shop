-- Order payment method selection compatibility.
-- Safe to execute manually. This migration does not create payment success records.

alter table public.orders
  add column if not exists payment_method text;

create index if not exists orders_payment_method_idx
  on public.orders(payment_method);

