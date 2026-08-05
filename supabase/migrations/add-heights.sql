-- ═══════════════════════════════════════════════════════════════
--  Différences de taille réalistes — parcours « Choisis ta star »
--  Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

-- ── Taille déclarée par l'utilisateur ───────────────────────────
-- Préremplit le champ lors des générations suivantes.
alter table sessions add column if not exists height_cm integer;
alter table sessions drop constraint if exists sessions_height_cm_check;
alter table sessions add constraint sessions_height_cm_check
  check (height_cm is null or height_cm between 120 and 220);

-- ── Fiches taille des célébrités ────────────────────────────────
-- Sert à la fois de base et de cache (y compris cache négatif :
-- une ligne confidence = 'unknown' évite de relancer une recherche
-- Internet à chaque génération).
create table if not exists celebrity_heights (
  -- Identifiant stable dérivé du nom (slug sans accents), pas le nom affiché
  celebrity_id    text primary key,
  display_name    text not null,
  height_cm       integer check (height_cm is null or height_cm between 120 and 260),
  source_url      text,
  verified_at     timestamptz,
  confidence      text not null default 'unknown'
                    check (confidence in ('verified', 'probable', 'unknown')),
  -- Correction manuelle (script d'administration) : jamais écrasée par une recherche
  manual_override boolean not null default false,
  lookup_attempts integer not null default 0,
  last_attempt_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists celebrity_heights_confidence_idx on celebrity_heights(confidence);

-- Écrit uniquement par le serveur (clé service role, qui contourne le RLS).
-- Aucune policy : la clé anon ne peut ni lire ni écrire.
alter table celebrity_heights enable row level security;
