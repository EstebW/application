-- Mode de création utilisé par une génération (à coller dans Supabase → SQL Editor).
--
-- Deux approches, proposées uniquement dans le parcours « Choisis ta star » :
--   full_generation : nouvelle scène générée, la photo user sert de référence d'identité
--   photo_edit      : la photo user est la base immuable, on y ajoute la star
--
-- Compatibilité : les lignes existantes (et tout le parcours « jumeau célèbre »)
-- restent à full_generation, qui est le comportement historique.

alter table generations add column if not exists creation_mode text;

alter table generations drop constraint if exists generations_creation_mode_check;
alter table generations add constraint generations_creation_mode_check
  check (creation_mode is null or creation_mode in ('full_generation', 'photo_edit'));

update generations
set creation_mode = 'full_generation'
where creation_mode is null;
