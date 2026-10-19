-- Sticker Bar sheets: one product sold as a digital download AND a physical sheet,
-- stock on hand, shop badges and series, Stack & Save tiers, free shipping threshold.
-- Run in Supabase → SQL Editor. Safe to re-run.

-- A physical product can also be sold as a download: set digital_price and upload
-- digital_file_path (the same PRIVATE bucket digital products use).
alter table products add column if not exists digital_price numeric;
-- Physical units on hand. null = not tracked. Lowered when a shop order is paid in full.
alter table products add column if not exists stock integer;
-- Shop label shown on the product card, e.g. 'New', 'Sale', 'Bestseller', 'Back in stock'.
alter table products add column if not exists badge text;
-- Smaller grouping inside a collection, e.g. 'Journal', 'Block Party', 'Book Lover', 'Coastal', 'Y2K'.
alter table products add column if not exists series text;

create or replace function decrement_product_stock(p_id uuid, p_qty integer) returns void
language sql security definer set search_path = public as $$
  update products set stock = greatest(stock - greatest(p_qty, 0), 0) where id = p_id and stock is not null;
$$;
-- Server-only (the API uses the service role). Functions are executable by PUBLIC by default,
-- so revoke that too, not just anon/authenticated.
revoke execute on function decrement_product_stock(uuid, integer) from public, anon, authenticated;
grant execute on function decrement_product_stock(uuid, integer) to service_role;
revoke execute on function increment_discount_uses(uuid) from public, anon, authenticated;
grant execute on function increment_discount_uses(uuid) to service_role;

insert into settings (key, value) values
  ('shop_free_shipping_over', '35'::jsonb),
  ('sticker_bar_tiers', '[{"min":3,"pct":10},{"min":5,"pct":15},{"min":8,"pct":20}]'::jsonb)
on conflict (key) do nothing;

-- Sticker Bar was first planned as an on-site event booking; it's a sticker-sheet shop instead.
-- orders.event_details and fulfillment = 'event' are no longer used by the app.

-- Her first six sheets as HIDDEN drafts (photos from her Sticker Bar mockups).
-- In the app: Shop → Products → open each one, upload the printable file, then tick "Visible in shop".
insert into products (name, description, price, digital_price, collection, series, badge, image_urls, kind, active, sort_order)
select v.name, 'A sheet of 12 premium waterproof vinyl stickers. Perfect for planners, journals, laptops and water bottles.', v.price, v.digital_price, 'sticker-bar', v.series, v.badge, array[v.image], 'physical', false, v.sort_order
from (values
  ('Peace in Progress',     'Journal',     'New',           6.50, 4.00, '/img/sticker-bar/peace-in-progress.webp',    1),
  ('Brooklyn Block Party',  'Block Party', 'Sale',          5.20, 3.20, '/img/sticker-bar/brooklyn-block-party.webp', 2),
  ('Autumn Book Babe',      'Book Lover',  'Bestseller',    6.50, 4.00, '/img/sticker-bar/autumn-book-babe.webp',     3),
  ('Amalfi Coast Girl',     'Coastal',     null,            6.50, 4.00, '/img/sticker-bar/amalfi-coast-girl.webp',    4),
  ('Summer Block Party',    'Block Party', null,            6.50, 4.00, '/img/sticker-bar/summer-block-party.webp',   5),
  ('Retro Girl Era',        'Y2K',         'Back in stock', 6.50, 4.00, '/img/sticker-bar/retro-girl-era.webp',       6)
) as v(name, series, badge, price, digital_price, image, sort_order)
where not exists (select 1 from products p where p.name = v.name and p.collection = 'sticker-bar');
