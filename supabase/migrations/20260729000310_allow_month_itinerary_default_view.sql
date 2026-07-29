alter table public.user_preferences
  drop constraint if exists user_preferences_itinerary_default_view_check;

alter table public.user_preferences
  add constraint user_preferences_itinerary_default_view_check
  check (itinerary_default_view = any (array['list'::text, 'day'::text, 'week'::text, 'month'::text]));
