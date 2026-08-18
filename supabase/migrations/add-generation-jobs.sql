-- Jobs KIE en cours : évite de bloquer l'Edge Function pendant le polling.
create table if not exists generation_jobs (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  user_id         uuid,
  kie_task_id     text not null,
  celebrity_name  text not null,
  scene_summary   text,
  creation_mode   text check (creation_mode is null or creation_mode in ('full_generation', 'photo_edit')),
  analysis_id     uuid references analyses(id) on delete set null,
  status          text not null default 'pending'
                    check (status in ('pending', 'success', 'failed')),
  fail_message    text,
  result_url      text,
  generation_id   uuid references generations(id) on delete set null,
  credit_consumed boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists generation_jobs_session_idx on generation_jobs(session_id);
create index if not exists generation_jobs_user_idx on generation_jobs(user_id);
create index if not exists generation_jobs_status_idx on generation_jobs(status);

alter table generation_jobs enable row level security;
