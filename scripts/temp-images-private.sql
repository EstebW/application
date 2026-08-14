-- Rend le bucket temp-images privé.
-- Les URLs signées (createSignedUrl) restent utilisables par l'edge generate.
-- À exécuter dans : Supabase Dashboard → SQL Editor → Run

update storage.buckets
set public = false
where id = 'temp-images';

drop policy if exists "temp_images_public_read" on storage.objects;
drop policy if exists "allow_read_temp" on storage.objects;
drop policy if exists "allow_upload_temp" on storage.objects;
drop policy if exists "allow_delete_temp" on storage.objects;
