alter table public.user_preferences
add column if not exists theme_mode text not null default 'dark';

do $$
begin
    if exists (
        select 1
        from pg_constraint
        where conname = 'user_preferences_theme_mode_check'
    ) then
        alter table public.user_preferences
        drop constraint user_preferences_theme_mode_check;
    end if;

    alter table public.user_preferences
    add constraint user_preferences_theme_mode_check
    check (
        theme_mode in (
            'dark',
            'pink',
            'greyscale',
            'brat',
            'pride',
            'light'
        )
    );
end $$;
