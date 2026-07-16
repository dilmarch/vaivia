alter table public.trip_ideas
add column if not exists location text,
add column if not exists location_city text,
add column if not exists location_region text,
add column if not exists location_country text,
add column if not exists location_country_code text,
add column if not exists location_postal_code text,
add column if not exists location_website text,
add column if not exists ticket_website text,
add column if not exists ticket_policy text not null default 'any',
add column if not exists age_policy text not null default 'all_ages',
add column if not exists dress_code text,
add column if not exists is_24_hours boolean not null default false;

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
        and table_name = 'trip_ideas'
        and column_name = 'address'
    ) then
        execute '
            update public.trip_ideas
            set location = address
            where location is null
            and address is not null
        ';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
        and table_name = 'trip_ideas'
        and column_name = 'ticket_type'
    ) then
        execute '
            update public.trip_ideas
            set ticket_policy = case
                when lower(replace(ticket_type, '' '', ''_'')) = ''free'' then ''free''
                when lower(replace(ticket_type, '' '', ''_'')) = ''advance_ticket'' then ''advance_ticket''
                when lower(replace(ticket_type, '' '', ''_'')) = ''door_ticket'' then ''door_ticket''
                when lower(replace(ticket_type, '' '', ''_'')) = ''any_ticket'' then ''any''
                else ''any''
            end
            where ticket_type is not null
        ';
    end if;

    update public.trip_ideas
    set ticket_policy = case
        when lower(ticket_policy) = 'free' then 'free'
        when lower(ticket_policy) = 'advance_ticket' then 'advance_ticket'
        when lower(ticket_policy) = 'door_ticket' then 'door_ticket'
        when lower(ticket_policy) in ('any', 'any_ticket') then 'any'
        else 'any'
    end
    where ticket_policy is null
    or lower(ticket_policy) not in ('free', 'advance_ticket', 'door_ticket', 'any');

    update public.trip_ideas
    set age_policy = case
        when lower(age_policy) in ('nineteen_plus', '19+') then 'nineteen_plus'
        else 'all_ages'
    end
    where age_policy is null
    or lower(age_policy) not in ('all_ages', 'nineteen_plus');
end
$$;

alter table public.trip_ideas
drop constraint if exists trip_ideas_ticket_policy_check,
add constraint trip_ideas_ticket_policy_check
check (ticket_policy in ('free', 'advance_ticket', 'door_ticket', 'any'));

alter table public.trip_ideas
drop constraint if exists trip_ideas_age_policy_check,
add constraint trip_ideas_age_policy_check
check (age_policy in ('all_ages', 'nineteen_plus'));
