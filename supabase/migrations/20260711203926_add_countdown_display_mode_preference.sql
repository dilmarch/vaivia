alter table public.user_preferences
add column if not exists countdown_display_mode text not null default 'days';

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'user_preferences_countdown_display_mode_check'
    ) then
        alter table public.user_preferences
        add constraint user_preferences_countdown_display_mode_check
        check (
            countdown_display_mode in (
                'days',
                'weeks',
                'hours',
                'minutes',
                'seconds',
                'mixed'
            )
        );
    end if;
end $$;
