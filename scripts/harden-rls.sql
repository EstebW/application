-- ═══════════════════════════════════════════════════════════════
--  StarFusion — Refermer le RLS (anon ne lit/écrit plus les tables sensibles)
--  Les edge functions / Next (service_role) bypassent le RLS.
--  Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

-- sessions
drop policy if exists "insert_sessions" on public.sessions;
drop policy if exists "select_own_sessions" on public.sessions;

-- analyses
drop policy if exists "insert_analyses" on public.analyses;
drop policy if exists "select_own_analyses" on public.analyses;

-- generations
drop policy if exists "insert_generations" on public.generations;
drop policy if exists "select_own_generations" on public.generations;

-- payments
drop policy if exists "insert_payments" on public.payments;
drop policy if exists "select_own_payments" on public.payments;

-- credit_transactions
drop policy if exists "insert_credit_transactions" on public.credit_transactions;
drop policy if exists "select_credit_transactions" on public.credit_transactions;

-- Aucune policy = bloqué pour anon/authenticated.
-- service_role (edges + Next serveur) continue de fonctionner.

alter table public.sessions enable row level security;
alter table public.analyses enable row level security;
alter table public.generations enable row level security;
alter table public.payments enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.user_roles enable row level security;
alter table public.celebrity_heights enable row level security;

-- Storage temp-images : retirer l’accès public large si les policies existent
drop policy if exists "allow_upload_temp" on storage.objects;
drop policy if exists "allow_read_temp" on storage.objects;
drop policy if exists "allow_delete_temp" on storage.objects;

-- Lecture publique optionnelle des images déjà uploadées (URLs Kie) —
-- l’upload reste service_role uniquement (pas de policy insert).
create policy "temp_images_public_read"
  on storage.objects for select
  using (bucket_id = 'temp-images');
