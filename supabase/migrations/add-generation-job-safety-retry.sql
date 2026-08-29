-- Contexte retry safety (service-role only — jamais exposé au client).
alter table generation_jobs
  add column if not exists kie_image_urls jsonb,
  add column if not exists retry_context jsonb,
  add column if not exists has_custom_prompt boolean not null default false,
  add column if not exists safety_retry_used boolean not null default false,
  add column if not exists fail_code text;
