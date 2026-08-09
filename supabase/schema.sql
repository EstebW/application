-- ═══════════════════════════════════════════════════════════════
--  StarFusion — Schéma Supabase
--  Colle ce SQL dans : Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

-- ── sessions ────────────────────────────────────────────────────
-- Une session = un visiteur (UUID généré côté client)
create table if not exists sessions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_agent text,
  ip_hash    text,       -- hash irréversible de l'IP (RGPD)
  email      text,       -- renseigné après l'email gate
  first_name text        -- optionnel
);

-- Ajout des colonnes si la table existe déjà
alter table sessions add column if not exists email      text;
alter table sessions add column if not exists first_name text;
alter table sessions add column if not exists user_id    uuid;
alter table sessions add column if not exists credits_balance integer not null default 0;
alter table sessions add column if not exists subscription_plan text;
alter table sessions add column if not exists subscription_expires_at timestamptz;
-- Moment où le compte auth a pris possession de la session (filtre l'historique mélangé)
alter table sessions add column if not exists owned_at timestamptz;
-- Taille déclarée par l'utilisateur (parcours « Choisis ta star ») — préremplissage
alter table sessions add column if not exists height_cm integer;
alter table sessions drop constraint if exists sessions_height_cm_check;
alter table sessions add constraint sessions_height_cm_check
  check (height_cm is null or height_cm between 120 and 220);

create index if not exists sessions_email_idx on sessions(email);
create index if not exists sessions_user_id_idx on sessions(user_id);

-- ── celebrity_heights ───────────────────────────────────────────
-- Fiche taille par célébrité : base + cache (y compris cache négatif).
-- Alimentée côté serveur (Wikidata puis Wikipédia), jamais depuis le client.
create table if not exists celebrity_heights (
  celebrity_id    text primary key,   -- slug stable dérivé du nom
  display_name    text not null,
  height_cm       integer check (height_cm is null or height_cm between 120 and 260),
  source_url      text,
  verified_at     timestamptz,
  confidence      text not null default 'unknown'
                    check (confidence in ('verified', 'probable', 'unknown')),
  manual_override boolean not null default false,
  lookup_attempts integer not null default 0,
  last_attempt_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists celebrity_heights_confidence_idx on celebrity_heights(confidence);

-- ── credit_transactions ─────────────────────────────────────────
create table if not exists credit_transactions (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  amount       integer not null,
  reason       text not null check (reason in ('payment', 'generation', 'refund', 'bonus')),
  reference_id uuid,
  created_at   timestamptz default now()
);

create index if not exists credit_transactions_session_idx on credit_transactions(session_id);

-- ── analyses ────────────────────────────────────────────────────
-- Résultat de l'analyse de visage
create table if not exists analyses (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  celebrity_name text not null,
  score          integer not null check (score between 0 and 100),
  traits         text[] not null default '{}',
  description    text,
  created_at     timestamptz default now()
);

create index if not exists analyses_session_idx on analyses(session_id);
create index if not exists analyses_celebrity_idx on analyses(celebrity_name);
alter table analyses add column if not exists user_id uuid;
create index if not exists analyses_user_id_idx on analyses(user_id);

-- ── generations ─────────────────────────────────────────────────
-- Chaque tentative de génération de photo
create table if not exists generations (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  analysis_id    uuid references analyses(id) on delete set null,
  celebrity_name text not null,
  unlocked       boolean not null default false,
  scene_summary  text,
  created_at     timestamptz default now()
);

create index if not exists generations_session_idx on generations(session_id);
alter table generations add column if not exists user_id uuid;
create index if not exists generations_user_id_idx on generations(user_id);

-- Mode de création (parcours « Choisis ta star ») : null = full_generation (historique)
alter table generations add column if not exists creation_mode text;
alter table generations drop constraint if exists generations_creation_mode_check;
alter table generations add constraint generations_creation_mode_check
  check (creation_mode is null or creation_mode in ('full_generation', 'photo_edit'));

-- ── payments ────────────────────────────────────────────────────
-- Paiement pour débloquer la version HD
create table if not exists payments (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  generation_id  uuid references generations(id) on delete set null,
  amount_cents   integer not null,
  currency       text not null default 'EUR',
  method         text,   -- 'card' | 'apple' | 'paypal'
  plan           text,   -- 'once' | 'weekly' | 'monthly'
  credits_granted integer,
  status         text not null default 'pending'
                   check (status in ('pending', 'completed', 'failed')),
  created_at     timestamptz default now()
);

create index if not exists payments_session_idx on payments(session_id);
create index if not exists payments_status_idx  on payments(status);

-- ── user_roles ───────────────────────────────────────────────────
-- Rôles applicatifs (user | admin | super_admin). Écriture manuelle / service_role.
create table if not exists user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'user'
               check (role in ('user', 'admin', 'super_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── RLS (Row Level Security) ─────────────────────────────────────
-- Les API routes utilisent la clé service role et contournent le RLS.
-- Le client browser (anon) ne peut pas lire les données des autres sessions.

alter table sessions   enable row level security;
alter table analyses   enable row level security;
alter table generations enable row level security;
alter table payments   enable row level security;
alter table credit_transactions enable row level security;
-- Aucune policy sur celebrity_heights / user_roles : tables serveur uniquement (service role)
alter table celebrity_heights enable row level security;
alter table user_roles enable row level security;

-- RLS strict : aucune policy anon/authenticated sur les tables sensibles.
-- Les edges / Next utilisent SUPABASE_SERVICE_ROLE_KEY (bypass RLS).
-- Pour une base déjà ouverte, exécuter aussi scripts/harden-rls.sql.

-- ── Storage bucket (images de référence temporaires) ───────────────────────
-- Les images sont supprimées après génération (privacy).
-- Si le bucket n'existe pas encore, le créer manuellement :
-- Supabase Dashboard → Storage → New bucket → "temp-images" → Public

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'temp-images',
  'temp-images',
  true,
  31457280,   -- 30 MB max
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Storage : lecture publique des URLs déjà créées ; upload/delete = service_role only
create policy "temp_images_public_read"
  on storage.objects for select
  using (bucket_id = 'temp-images');

-- ── Vue analytics (optionnelle) ─────────────────────────────────
create or replace view celebrity_stats as
  select
    celebrity_name,
    count(*)           as total_analyses,
    avg(score)::int    as avg_score,
    max(score)         as max_score,
    min(created_at)    as first_seen,
    max(created_at)    as last_seen
  from analyses
  group by celebrity_name
  order by total_analyses desc;
