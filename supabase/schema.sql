-- ════════════════════════════════════════════════════════════════════════════
-- Create(L)ive(Ly) Studio — order management schema
-- Run once in Supabase → SQL Editor. Safe to re-run (IF NOT EXISTS everywhere).
--
-- Security model:
--   • The browser uses the ANON key. Anonymous visitors can read NOTHING directly.
--     Customer pages (quote, proof, shop) go through /api endpoints that use the
--     service-role key and return only customer-safe fields (never po_number).
--   • Logged-in admins (rows in admin_users) get full access via RLS.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Admins ──────────────────────────────────────────────────────────────────
-- Create the login in Supabase → Authentication → Users, then:
--   insert into admin_users (user_id, email)
--   select id, email from auth.users where email = 'owner@example.com';
create table if not exists admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_users where user_id = auth.uid())
$$;

-- ── Orders ──────────────────────────────────────────────────────────────────
create table if not exists orders (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),

  -- Request
  product_type          text,
  description           text,
  quantity              integer default 1,
  size                  text,
  finish                text,
  need_by               date,
  notes                 text,
  image_urls            text[],
  source                text default 'form',          -- 'form' | 'shop' | 'invoice'
  fulfillment           text default 'pickup',        -- 'pickup' | 'shipping' | 'digital' (download-only shop orders) | 'event' (Sticker Bar)
  event_details         jsonb,                        -- Sticker Bar bookings: { eventType, startTime, duration, venue, address }
  shipping_address      jsonb,                        -- { name, street, city, state, zip }

  -- Customer
  customer_name         text not null,
  customer_email        text not null,
  customer_phone        text,

  -- Status
  status                text not null default 'pending',

  -- Quote
  price                 numeric,
  deposit_type          text default 'full',          -- 'full' | 'percent' | 'fixed'
  deposit_amount        numeric,
  turnaround            text,
  quote_note            text,
  quote_breakdown       jsonb,                        -- calculator line items
  quote_sent_at         timestamptz,
  payment_methods       text[] default array['square'], -- 'square' | 'in_person'
  stripe_payment_url    text,                         -- latest hosted payment link (Square). Name kept from the reference app.

  -- E-sign
  customer_signature    text,
  terms_agreed_at       timestamptz,

  -- Payments
  deposit_paid          boolean default false,
  deposit_paid_at       timestamptz,
  balance_paid          boolean default false,
  paid_at               timestamptz,
  amount_paid           numeric default 0,

  -- Shop
  shop_cart             jsonb,
  shop_discount_code    text,
  shop_discount_amount  numeric,
  download_count        integer default 0,            -- digital download links generated

  -- Proofs
  proof_urls            text[],
  proof_items           jsonb,                        -- [{ url, label }]
  proof_note            text,
  proof_status          text,                         -- 'sent' | 'approved' | 'changes_requested'
  proof_sent_at         timestamptz,
  proof_approved_at     timestamptz,
  revision_notes        text,
  revision_history      jsonb default '[]'::jsonb,    -- [{ round, note, submittedAt }]

  -- Shipping
  tracking_number       text,
  shipping_carrier      text,
  shipping_label_url    text,
  shipped_at            timestamptz,

  -- Admin-only — NEVER returned to customers (api/get-order.js strips these)
  po_number             text,
  internal_notes        text
);

create index if not exists orders_status_idx on orders (status);
create index if not exists orders_created_idx on orders (created_at desc);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists orders_touch on orders;
create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();

-- ── Payments (one row per hosted Square checkout) ───────────────────────────
create table if not exists payments (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz default now(),
  order_id         uuid not null references orders(id) on delete cascade,
  kind             text not null,                     -- 'deposit' | 'balance' | 'full'
  amount           numeric not null,
  status           text not null default 'pending',   -- 'pending' | 'paid'
  square_order_id  text unique,
  square_link_id   text,
  square_payment_id text,
  url              text,
  paid_at          timestamptz
);
create index if not exists payments_order_idx on payments (order_id);

-- ── Shop products ───────────────────────────────────────────────────────────
create table if not exists products (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz default now(),
  name                  text not null,
  description           text,
  price                 numeric not null,
  image_urls            text[],
  kind                  text not null default 'physical', -- 'physical' | 'digital'
  collection            text,                         -- key from COLLECTIONS in src/brand.js (labs, paper-studio, vendors, elevate)
  options               text[],                       -- e.g. sizes / finishes the customer picks from (physical only)
  digital_file_path     text,                         -- path in the PRIVATE digital-products bucket (never sent to the browser)
  digital_file_name     text,                         -- original filename shown to buyers
  bulk_pricing_enabled  boolean default true,
  active                boolean default true,
  sort_order            integer default 0
);

-- ── Settings (key/value) ────────────────────────────────────────────────────
create table if not exists settings (
  key    text primary key,
  value  jsonb not null
);
insert into settings (key, value) values
  ('shop_open', 'true'::jsonb),
  ('shop_closed_message', '"The shop is taking a short break — check back soon!"'::jsonb),
  ('shop_shipping_fee', '5'::jsonb),
  ('in_person_payment_note', '"Paying in person? Reply to your quote email and we will set it up."'::jsonb)
on conflict (key) do nothing;

-- ── Discount codes ──────────────────────────────────────────────────────────
create table if not exists discount_codes (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  code            text not null unique,
  discount_type   text not null default 'percent',    -- 'percent' | 'fixed'
  discount_value  numeric not null,
  active          boolean default true,
  uses            integer default 0,
  max_uses        integer,                            -- null = unlimited
  expires_at      timestamptz
);

create or replace function increment_discount_uses(code_id uuid) returns void
language sql security definer set search_path = public as $$
  update discount_codes set uses = coalesce(uses, 0) + 1 where id = code_id;
$$;
revoke execute on function increment_discount_uses(uuid) from anon, authenticated;

-- ── Web push subscriptions (admin devices) ──────────────────────────────────
create table if not exists push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  subscription  jsonb not null,
  endpoint      text generated always as (subscription->>'endpoint') stored unique
);

-- ── AppQue submissions (kept for parity with the reference app) ─────────────
create table if not exists appque_submissions (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz default now(),
  client_name           text,
  client_email          text,
  client_phone          text,
  sms_opt_in            boolean default false,
  tier                  text,
  description           text,
  questions             text[],
  answers               text[],
  estimated_price       numeric,
  deposit_paid          boolean default false,
  status                text default 'new',
  quote_json            jsonb,
  stripe_quote_url      text,
  quote_sent_at         timestamptz,
  deposit_paid_at       timestamptz,
  acceptance_sent_at    timestamptz,
  kickoff_data          jsonb,
  kickoff_submitted_at  timestamptz
);

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table admin_users        enable row level security;
alter table orders             enable row level security;
alter table payments           enable row level security;
alter table products           enable row level security;
alter table settings           enable row level security;
alter table discount_codes     enable row level security;
alter table push_subscriptions enable row level security;
alter table appque_submissions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['admin_users','orders','payments','products','settings',
                           'discount_codes','push_subscriptions','appque_submissions'] loop
    execute format('drop policy if exists "admin full access" on %I', t);
    execute format('create policy "admin full access" on %I for all to authenticated
                    using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Live dashboard updates (RLS still applies to realtime).
do $$ begin
  alter publication supabase_realtime add table orders;
exception when duplicate_object then null; end $$;

-- ── Storage buckets ─────────────────────────────────────────────────────────
-- order-files: customer artwork uploads. order-proofs: admin proof images/PDFs.
-- Both public-read so links work in emails; uploads only happen via signed URLs
-- minted by /api/get-upload-url (anon cannot write directly).
insert into storage.buckets (id, name, public, file_size_limit)
values ('order-files', 'order-files', true, 26214400),     -- 25 MB
       ('order-proofs', 'order-proofs', true, 26214400),
       ('product-images', 'product-images', true, 10485760) -- 10 MB
on conflict (id) do nothing;

-- digital-products: PRIVATE. Files are only reachable through short-lived signed URLs
-- that /api/get-downloads creates after an order is paid in full.
-- 50 MB matches Supabase's free-plan per-file cap; raise it on a paid plan if needed.
insert into storage.buckets (id, name, public, file_size_limit)
values ('digital-products', 'digital-products', false, 52428800)
on conflict (id) do nothing;
