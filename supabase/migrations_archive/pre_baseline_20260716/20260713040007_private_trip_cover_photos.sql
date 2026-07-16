alter table public.trips
add column if not exists cover_image_source text,
add column if not exists cover_image_unsplash_id text,
add column if not exists cover_image_photographer_name text,
add column if not exists cover_image_photographer_url text,
add column if not exists cover_image_storage_path text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'trips_cover_image_source_check'
      and conrelid = 'public.trips'::regclass
  ) then
    alter table public.trips
    drop constraint trips_cover_image_source_check;
  end if;

  alter table public.trips
  add constraint trips_cover_image_source_check
  check (
    cover_image_source is null
    or cover_image_source in ('upload', 'unsplash', 'external')
  );
end $$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'trip-covers',
  'trip-covers',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Trip cover uploaders can read their own covers"
  on storage.objects;
drop policy if exists "Trip cover uploaders can upload their own covers"
  on storage.objects;
drop policy if exists "Trip cover uploaders can update their own covers"
  on storage.objects;
drop policy if exists "Trip cover uploaders can delete their own covers"
  on storage.objects;

create policy "Trip cover uploaders can read their own covers"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'trip-covers'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy "Trip cover uploaders can upload their own covers"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'trip-covers'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy "Trip cover uploaders can update their own covers"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'trip-covers'
  and (select auth.uid())::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'trip-covers'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);

create policy "Trip cover uploaders can delete their own covers"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'trip-covers'
  and (select auth.uid())::text = (storage.foldername(name))[1]
);
