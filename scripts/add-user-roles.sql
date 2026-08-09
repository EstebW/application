-- ═══════════════════════════════════════════════════════════════
--  StarFusion — Rôles applicatifs (admin / super_admin)
--  Exécuter dans : Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'user'
               check (role in ('user', 'admin', 'super_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_roles is
  'Rôles applicatifs. Écriture manuelle / service_role uniquement — jamais depuis le client.';

alter table public.user_roles enable row level security;

-- Aucune policy : PostgREST (anon/authenticated) ne peut ni lire ni écrire.
-- Les edge functions et le serveur Next utilisent la service_role (bypass RLS).

-- ── Attribution Super Admin (remplace l’email) ──────────────────
-- insert into public.user_roles (user_id, role)
-- select id, 'super_admin'
-- from auth.users
-- where lower(email) = lower('TON_EMAIL@exemple.com')
-- on conflict (user_id) do update
--   set role = excluded.role,
--       updated_at = now();
