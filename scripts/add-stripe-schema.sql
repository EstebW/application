-- Migration Stripe — à exécuter dans Supabase SQL Editor

alter table sessions add column if not exists stripe_customer_id text;

alter table payments add column if not exists stripe_checkout_session_id text;
alter table payments add column if not exists stripe_payment_intent_id text;
alter table payments add column if not exists stripe_invoice_id text;
alter table payments add column if not exists stripe_subscription_id text;

create unique index if not exists payments_stripe_checkout_session_uidx
  on payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists payments_stripe_invoice_uidx
  on payments (stripe_invoice_id)
  where stripe_invoice_id is not null;

create index if not exists sessions_stripe_customer_idx
  on sessions (stripe_customer_id)
  where stripe_customer_id is not null;
