alter table public.trips
add column if not exists cover_image_url text;

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'trips'
          and column_name = 'trip_cover_image_url'
    ) then
        update public.trips
        set cover_image_url = trip_cover_image_url
        where cover_image_url is null
          and trip_cover_image_url is not null;
    end if;
end $$;
