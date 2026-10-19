-- Switch online payments from Square to Stripe Checkout.
-- Run in Supabase → SQL Editor. Safe to re-run.

-- One row per Stripe Checkout Session; the webhook matches on stripe_session_id.
alter table payments add column if not exists stripe_session_id        text;
alter table payments add column if not exists stripe_payment_intent_id text;
create unique index if not exists payments_stripe_session_id_key on payments (stripe_session_id);

-- Provider-neutral payment method name: 'card' (Stripe) | 'in_person'.
alter table orders alter column payment_methods set default array['card'];
update orders set payment_methods = array_replace(payment_methods, 'square', 'card')
where 'square' = any(payment_methods);
