-- Small Business License: products can ask "personal or small business use?". Picking small
-- business on any item adds the license fee once per order (price/name/details in settings).
-- Re-runnable.

alter table products add column if not exists ask_use boolean not null default false;

-- Price 0 = the question is off until she sets a price in Shop → Shop settings.
insert into settings (key, value)
values ('business_license', '{"price": 0, "name": "Small Business License", "details": "Lets you use these designs in products you sell or in your business."}'::jsonb)
on conflict (key) do nothing;
