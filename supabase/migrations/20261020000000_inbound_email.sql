-- Customer replies received through Resend (inbound) are stored alongside sent emails.
alter table email_log add column if not exists direction       text not null default 'out'; -- 'out' | 'in'
alter table email_log add column if not exists from_email      text;
alter table email_log add column if not exists attachment_urls text[];
alter table email_log add column if not exists read_at         timestamptz;                -- inbound: when she opened it
alter table email_log add column if not exists resend_email_id text;                       -- inbound: Resend id (webhook retries are deduped on this)
create unique index if not exists email_log_resend_email_id_key on email_log (resend_email_id);
create index if not exists email_log_inbox_idx on email_log (created_at desc) where direction = 'in';

-- Live inbox badge on the dashboard.
do $$ begin
  alter publication supabase_realtime add table email_log;
exception when duplicate_object then null; end $$;
