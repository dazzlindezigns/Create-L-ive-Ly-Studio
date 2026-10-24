-- LiveLy Circle partner perks + automatic review reminders.
-- Run in Supabase → SQL Editor. Safe to re-run.

-- How she pays each partner (e.g. Cash App + $tasha), their own shopping discount, and when they were welcomed.
alter table affiliates add column if not exists payout_method text;               -- 'Cash App' | 'Zelle' | 'PayPal' | 'Venmo' | other
alter table affiliates add column if not exists payout_handle text;               -- e.g. $tasha, phone/email for Zelle
alter table affiliates add column if not exists own_discount  numeric not null default 25; -- % off their own orders
alter table affiliates add column if not exists welcomed_at   timestamptz;

-- When an order became Complete (set by the trigger below, whatever completes it), and when
-- the one automatic "leave a review" reminder went out.
alter table orders add column if not exists completed_at            timestamptz;
alter table orders add column if not exists review_reminder_sent_at timestamptz;

create or replace function set_completed_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end $$;
drop trigger if exists orders_completed_at on orders;
create trigger orders_completed_at before insert or update of status on orders
  for each row execute function set_completed_at();

-- Older completed orders: best guess at when they finished.
update orders set completed_at = coalesce(paid_at, created_at)
where status = 'completed' and completed_at is null;
