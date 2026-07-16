alter table public.trip_expenses
  add column if not exists original_amount numeric(12, 2),
  add column if not exists original_currency text,
  add column if not exists transaction_date date;

update public.trip_expenses
set
  original_amount = coalesce(original_amount, amount),
  original_currency = coalesce(original_currency, currency),
  transaction_date = coalesce(transaction_date, expense_date)
where original_amount is null
   or original_currency is null
   or transaction_date is null;

alter table public.trip_expenses
  drop constraint if exists trip_expenses_original_amount_check,
  add constraint trip_expenses_original_amount_check
    check (original_amount is null or original_amount > 0);

alter table public.trip_expenses
  drop constraint if exists trip_expenses_original_currency_check,
  add constraint trip_expenses_original_currency_check
    check (original_currency is null or original_currency ~ '^[A-Z]{3}$');

create index if not exists trip_expenses_trip_transaction_date_idx
  on public.trip_expenses (trip_id, transaction_date);

comment on column public.trip_expenses.original_amount is
  'Original transaction amount entered by the user. Kept alongside amount for backward compatibility.';

comment on column public.trip_expenses.original_currency is
  'Original ISO 4217 transaction currency entered by the user. Never store currency symbols here.';

comment on column public.trip_expenses.transaction_date is
  'Transaction date used when selecting and freezing the exchange_rate_used for this expense.';
