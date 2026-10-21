-- Product options in groups (Size, Color, Sticker style…), each choice with an optional price change.
-- Shape: [{ "name": "Size", "choices": [{ "label": "3 inch", "price": 0 }, { "label": "4 inch", "price": 1.5 }] }]
-- Run in Supabase → SQL Editor. Safe to re-run.

alter table products add column if not exists option_groups jsonb not null default '[]'::jsonb;

-- Carry the old single "options" list over as one group (only where nothing is set yet).
update products
set option_groups = jsonb_build_array(jsonb_build_object(
  'name', 'Option',
  'choices', (select jsonb_agg(jsonb_build_object('label', o, 'price', 0)) from unnest(options) as o)
))
where option_groups = '[]'::jsonb and coalesce(array_length(options, 1), 0) > 0;
