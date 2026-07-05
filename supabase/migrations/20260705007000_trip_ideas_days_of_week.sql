alter table public.trip_ideas
add column if not exists days_of_week jsonb not null default '[]'::jsonb;

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
        and table_name = 'trip_ideas'
        and column_name = 'days_available'
    ) then
        update public.trip_ideas
        set days_of_week = (
            select coalesce(jsonb_agg(lower(day_value)), '[]'::jsonb)
            from jsonb_array_elements_text(days_available) as day_value
        )
        where days_of_week = '[]'::jsonb
        and days_available <> '[]'::jsonb;
    end if;
end
$$;
