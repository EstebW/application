-- Jobs d'analyse faciale : évite le timeout Edge Function pendant l'appel KIE/Gemini.
create table if not exists analysis_jobs (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid references sessions(id) on delete cascade,
  user_id         uuid,
  image_base64    text,
  status          text not null default 'pending'
                    check (status in ('pending', 'processing', 'success', 'failed')),
  result_json     jsonb,
  fail_message    text,
  analysis_id     uuid references analyses(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists analysis_jobs_session_idx on analysis_jobs(session_id);
create index if not exists analysis_jobs_user_idx on analysis_jobs(user_id);
create index if not exists analysis_jobs_status_idx on analysis_jobs(status);

alter table analysis_jobs enable row level security;
