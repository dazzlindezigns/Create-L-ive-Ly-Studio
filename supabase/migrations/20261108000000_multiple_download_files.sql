-- Digital products can have more than one download file.
-- products.digital_files = [{ "path": "<private storage path>", "name": "<file name>" }, ...]
-- The first file is also kept in digital_file_path / digital_file_name, so older code and orders keep working.
-- Re-runnable.

alter table products add column if not exists digital_files jsonb not null default '[]'::jsonb;

-- Products that already have a single file get it as their one-file list.
update products
set digital_files = jsonb_build_array(jsonb_build_object('path', digital_file_path, 'name', coalesce(digital_file_name, 'download')))
where digital_file_path is not null
  and digital_files = '[]'::jsonb;
