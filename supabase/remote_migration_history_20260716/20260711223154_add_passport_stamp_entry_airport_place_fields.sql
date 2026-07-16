alter table public.user_passport_stamps
add column if not exists first_entry_airport_name text,
add column if not exists first_entry_airport_google_place_id text,
add column if not exists first_entry_airport_formatted_address text;;
