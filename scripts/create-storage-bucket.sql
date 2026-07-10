-- Crée le bucket Storage requis par la génération d'images
-- À exécuter dans : Supabase Dashboard → SQL Editor → Run
-- https://supabase.com/dashboard/project/glgizfydsqsomrixgdyx/sql/new

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'temp-images',
  'temp-images',
  true,
  31457280,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Politiques d'accès au bucket
do $$ begin
  create policy "allow_upload_temp"
    on storage.objects for insert
    with check (bucket_id = 'temp-images');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "allow_read_temp"
    on storage.objects for select
    using (bucket_id = 'temp-images');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "allow_delete_temp"
    on storage.objects for delete
    using (bucket_id = 'temp-images');
exception when duplicate_object then null;
end $$;
