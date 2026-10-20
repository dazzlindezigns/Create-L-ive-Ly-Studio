-- Let signed-in admins upload product photos, proofs and download files straight to
-- Supabase Storage, so adding products doesn't depend on the API's server key.
-- Run in Supabase → SQL Editor. Safe to re-run.

drop policy if exists "admins manage studio files" on storage.objects;
create policy "admins manage studio files" on storage.objects
  for all to authenticated
  using (bucket_id in ('product-images', 'order-proofs', 'digital-products') and public.is_admin())
  with check (bucket_id in ('product-images', 'order-proofs', 'digital-products') and public.is_admin());
