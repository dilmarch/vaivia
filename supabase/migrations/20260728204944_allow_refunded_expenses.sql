alter table public.trip_expense_splits
    drop constraint if exists trip_expense_splits_split_amount_check;

alter table public.trip_expenses
    drop constraint if exists trip_expenses_amount_check,
    drop constraint if exists trip_expenses_original_amount_check;

alter table public.trip_expenses
    add constraint trip_expenses_amount_check check (amount <> 0),
    add constraint trip_expenses_original_amount_check
        check (original_amount is null or original_amount <> 0);
