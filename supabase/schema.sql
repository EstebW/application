-- ═══════════════════════════════════════════════════════════════
--  Mon Jumeau Célèbre — Schéma Supabase
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

create index if not exists sessions_email_idx on sessions(email);

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

-- ── generations ─────────────────────────────────────────────────
-- Chaque tentative de génération de photo
create table if not exists generations (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  analysis_id    uuid references analyses(id) on delete set null,
  celebrity_name text not null,
  unlocked       boolean not null default false,
  created_at     timestamptz default now()
);

create index if not exists generations_session_idx on generations(session_id);

-- ── payments ────────────────────────────────────────────────────
-- Paiement pour débloquer la version HD
create table if not exists payments (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  generation_id  uuid references generations(id) on delete set null,
  amount_cents   integer not null,
  currency       text not null default 'EUR',
  method         text,   -- 'card' | 'apple' | 'paypal'
  status         text not null default 'pending'
                   check (status in ('pending', 'completed', 'failed')),
  created_at     timestamptz default now()
);

create index if not exists payments_session_idx on payments(session_id);
create index if not exists payments_status_idx  on payments(status);

-- ── RLS (Row Level Security) ─────────────────────────────────────
-- Les API routes utilisent la clé service role et contournent le RLS.
-- Le client browser (anon) ne peut pas lire les données des autres sessions.

alter table sessions   enable row level security;
alter table analyses   enable row level security;
alter table generations enable row level security;
alter table payments   enable row level security;

-- Politique : INSERT ouvert (la clé anon peut créer des lignes)
create policy "insert_sessions"    on sessions    for insert with check (true);
create policy "insert_analyses"    on analyses    for insert with check (true);
create policy "insert_generations" on generations for insert with check (true);
create policy "insert_payments"    on payments    for insert with check (true);

-- Politique : SELECT uniquement sa propre session
-- (les API routes utilisent service role et bypassent ces règles)
create policy "select_own_sessions"
  on sessions for select
  using (true);   -- les sessions sont publiques (pas de données perso)

create policy "select_own_analyses"
  on analyses for select
  using (true);

create policy "select_own_generations"
  on generations for select
  using (true);

create policy "select_own_payments"
  on payments for select
  using (true);

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

-- Politique storage : tout le monde peut upload (clé service role requis côté serveur)
create policy "allow_upload_temp"
  on storage.objects for insert
  with check (bucket_id = 'temp-images');

create policy "allow_read_temp"
  on storage.objects for select
  using (bucket_id = 'temp-images');

create policy "allow_delete_temp"
  on storage.objects for delete
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
