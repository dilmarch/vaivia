alter table public.trip_expenses
    add column if not exists budget_category_id uuid
    references public.trip_budget_categories(id)
    on delete set null;

create index if not exists trip_expenses_budget_category_id_idx
on public.trip_expenses(budget_category_id);

update public.trip_expenses expense
set budget_category_id = (
    select category.id
    from public.trip_budget_categories category
    where category.trip_id = expense.trip_id
      and category.linked_expense_category = expense.category
      and category.is_archived = false
    order by category.sort_order asc, category.name asc
    limit 1
)
where expense.budget_category_id is null
  and exists (
      select 1
      from public.trip_budget_categories category
      where category.trip_id = expense.trip_id
        and category.linked_expense_category = expense.category
        and category.is_archived = false
  );
