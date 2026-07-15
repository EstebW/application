-- Migration crédits & abonnements — Supabase SQL Editor
-- À exécuter après schema.sql (ou sur une base déjà existante)

-- Colonnes sessions (email peut manquer sur les anciennes bases)
alter table sessions add column if not exists email      text;
alter table sessions add column if not exists first_name text;
alter table sessions add column if not exists user_id    uuid;
alter table sessions add column if not exists credits_balance integer not null default 0;
alter table sessions add column if not exists subscription_plan text;
alter table sessions add column if not exists subscription_expires_at timestamptz;

alter table payments add column if not exists plan text;
alter table payments add column if not exists credits_granted integer;

alter table generations add column if not exists scene_summary text;

create table if not exists credit_transactions (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  amount     integer not null,
  reason     text not null check (reason in ('payment', 'generation', 'refund', 'bonus')),
  reference_id uuid,
  created_at timestamptz default now()
);

create index if not exists credit_transactions_session_idx on credit_transactions(session_id);
create index if not exists sessions_email_idx on sessions(email);
create index if not exists sessions_user_id_idx on sessions(user_id);

alter table credit_transactions enable row level security;

-- Politiques (ignore si déjà créées)
do $$ begin
  create policy "insert_credit_transactions" on credit_transactions for insert with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "select_credit_transactions" on credit_transactions for select using (true);
exception when duplicate_object then null;
end $$;
