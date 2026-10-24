-- Refunds (full or partial) and a minimum order for discount codes.
-- Run in Supabase → SQL Editor. Safe to re-run.

-- Running total refunded on an order. amount_paid stays what was paid; net = amount_paid - refunded_amount.
alter table orders add column if not exists refunded_amount numeric not null default 0;
alter table orders add column if not exists refunded_at     timestamptz;

-- Each refund is a payments row: kind 'refund', status 'refunded', pointing at the payment it returns.
alter table payments add column if not exists refund_of        uuid references payments(id) on delete cascade;
alter table payments add column if not exists stripe_refund_id text;

-- Codes only apply once the cart (after Stack & Save, before shipping) reaches this amount. Null = no minimum.
alter table discount_codes add column if not exists min_order numeric;

-- Puts refunded shop items back in stock (untracked products are skipped). Server-only, like decrement_product_stock.
create or replace function restock_product(p_id uuid, p_qty integer) returns void
language sql security definer set search_path = public as $$
  update products set stock = stock + greatest(p_qty, 0) where id = p_id and stock is not null;
$$;
revoke execute on function restock_product(uuid, integer) from public, anon, authenticated;
grant execute on function restock_product(uuid, integer) to service_role;
