create unique index if not exists user_profiles_username_unique_ci_idx
on public.user_profiles (lower(btrim(username)))
where username is not null and btrim(username) <> '';
comment on index public.user_profiles_username_unique_ci_idx
is 'Ensures filled VAIVIA usernames are unique case-insensitively while existing users without usernames can be prompted in-app.';
