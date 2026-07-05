update public.trip_ideas
set time_of_day = (
    select coalesce(jsonb_agg(
        case lower(replace(time_value, ' ', '_'))
            when 'early_morning' then 'early_morning'
            when 'morning' then 'morning'
            when 'afternoon' then 'afternoon'
            when 'evening' then 'evening'
            when 'late_night' then 'late_night'
            else null
        end
    ) filter (
        where lower(replace(time_value, ' ', '_')) in (
            'early_morning',
            'morning',
            'afternoon',
            'evening',
            'late_night'
        )
    ), '[]'::jsonb)
    from jsonb_array_elements_text(time_of_day) as time_value
)
where jsonb_typeof(time_of_day) = 'array';

alter table public.trip_ideas
drop constraint if exists trip_ideas_time_of_day_allowed,
add constraint trip_ideas_time_of_day_allowed
check (
    jsonb_typeof(time_of_day) = 'array'
    and not jsonb_path_exists(
        time_of_day,
        '$[*] ? (@ != "early_morning" && @ != "morning" && @ != "afternoon" && @ != "evening" && @ != "late_night")'
    )
);
