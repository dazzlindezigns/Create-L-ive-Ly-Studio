-- Create(L)ive(Ly) Finds: imported drafts she reviews before publishing.
-- Run in Supabase → SQL Editor. Safe to re-run.
alter table finds add column if not exists draft        boolean not null default false; -- imported, waiting for her OK
alter table finds add column if not exists note_options jsonb;                          -- the assistant's other "why I love it" lines
alter table finds add column if not exists icon         text;                           -- emoji shown on the tag card when there's no photo
