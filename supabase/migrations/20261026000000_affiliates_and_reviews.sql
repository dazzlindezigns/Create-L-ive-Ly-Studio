-- Partner (affiliate) program, product star reviews, and private shopping-experience feedback.
-- Run in Supabase → SQL Editor. Safe to re-run.

-- ── Partners ────────────────────────────────────────────────────────────────
-- A partner shares links with ?ref=<code>. `token` is the secret in their private stats link (/partner/<token>).
create table if not exists affiliates (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz default now(),
  name         text not null,
  email        text,
  code         text not null unique,
  rate         numeric not null default 25,          -- percent of items (after discounts, before shipping)
  active       boolean not null default true,
  token        uuid not null default gen_random_uuid() unique,
  payout_note  text,                                  -- how she pays them, e.g. "Cash App $tasha"
  clicks       integer not null default 0
);

-- One row each time she pays a partner; the orders it covers point at it.
create table if not exists affiliate_payouts (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  affiliate_id  uuid not null references affiliates(id) on delete cascade,
  amount        numeric not null,
  note          text
);

alter table orders add column if not exists affiliate_id         uuid references affiliates(id) on delete set null;
alter table orders add column if not exists commission           numeric;  -- full commission when the order was placed
alter table orders add column if not exists commission_payout_id uuid references affiliate_payouts(id) on delete set null;
create index if not exists orders_affiliate_idx on orders (affiliate_id);

-- Counts a visit from a partner link (public site → /api/track-ref). Server-only.
create or replace function count_affiliate_click(p_code text) returns void
language sql security definer set search_path = public as $$
  update affiliates set clicks = clicks + 1 where lower(code) = lower(p_code) and active;
$$;
revoke execute on function count_affiliate_click(text) from public, anon, authenticated;
grant execute on function count_affiliate_click(text) to service_role;

-- ── Reviews (public, per product, verified buyers only) ─────────────────────
create table if not exists reviews (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  product_id  uuid not null references products(id) on delete cascade,
  order_id    uuid not null references orders(id) on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  body        text,
  name        text,                                   -- shown publicly, e.g. "Sheila H."
  hidden      boolean not null default false,         -- she can hide a review from the shop
  read_at     timestamptz,
  unique (order_id, product_id)
);
create index if not exists reviews_product_idx on reviews (product_id);

-- ── Shopping-experience feedback (private, one per order) ───────────────────
create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  order_id    uuid not null unique references orders(id) on delete cascade,
  rating      integer check (rating between 1 and 5),
  body        text,
  read_at     timestamptz
);

-- Admins read/write directly; customers and partners only go through /api.
alter table affiliates        enable row level security;
alter table affiliate_payouts enable row level security;
alter table reviews           enable row level security;
alter table feedback          enable row level security;
do $$
declare t text;
begin
  foreach t in array array['affiliates', 'affiliate_payouts', 'reviews', 'feedback'] loop
    execute format('drop policy if exists "admin full access" on %I', t);
    execute format('create policy "admin full access" on %I for all to authenticated
                    using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;
