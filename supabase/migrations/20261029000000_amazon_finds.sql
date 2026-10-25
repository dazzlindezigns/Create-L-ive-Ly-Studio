-- Create(L)ive(Ly) Finds: her curated Amazon favorites (affiliate links), shown at /finds.
-- Run in Supabase → SQL Editor. Safe to re-run.
create table if not exists finds (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  title       text not null,
  note        text,                                    -- "why I love it", in her words
  url         text not null,                           -- Amazon link (amazon.com / amzn.to / a.co only)
  image_url   text,                                    -- her own photo of it (uploaded to product-images)
  shelf       text,                                    -- e.g. 'craft-table' (FINDS.shelves in src/brand.js)
  badge       text,                                    -- e.g. 'My #1 pick'
  featured    boolean not null default false,
  pairs_with  uuid references products(id) on delete set null, -- "I use this to make …" → her product
  sort_order  integer not null default 0,
  active      boolean not null default true,
  clicks      integer not null default 0
);
create index if not exists finds_order_idx on finds (sort_order, created_at);

alter table finds enable row level security;
drop policy if exists "admin full access" on finds;
create policy "admin full access" on finds for all to authenticated using (is_admin()) with check (is_admin());

-- Counts a tap on "Get it on Amazon" (public page → /api/track-find). Server-only.
create or replace function count_find_click(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update finds set clicks = clicks + 1 where id = p_id and active;
$$;
revoke execute on function count_find_click(uuid) from public, anon, authenticated;
grant execute on function count_find_click(uuid) to service_role;
