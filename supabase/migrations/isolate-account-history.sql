-- Isolation des historiques par compte (à coller dans Supabase → SQL Editor)
-- Corrige le mélange d'analyses entre plusieurs comptes sur une même session navigateur.

alter table sessions add column if not exists owned_at timestamptz;
alter table analyses add column if not exists user_id uuid;
alter table generations add column if not exists user_id uuid;

create index if not exists analyses_user_id_idx on analyses(user_id);
create index if not exists generations_user_id_idx on generations(user_id);

-- Les sessions déjà liées sans owned_at : on ancre "maintenant" pour masquer
-- l'historique pollué hérité d'autres comptes sur le même session_id local.
update sessions
set owned_at = now()
where user_id is not null
  and owned_at is null;
