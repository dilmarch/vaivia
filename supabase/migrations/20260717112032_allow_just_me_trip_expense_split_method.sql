alter table public.trip_expenses
  drop constraint if exists trip_expenses_split_method_check,
  add constraint trip_expenses_split_method_check
    check (split_method in ('just_me', 'equal', 'exact', 'percentage'));
