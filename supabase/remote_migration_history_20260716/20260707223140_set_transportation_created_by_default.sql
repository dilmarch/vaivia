alter table public.transportation_items
  alter column created_by set default auth.uid();

create or replace function public.set_transportation_item_created_by()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists set_transportation_item_created_by_before_insert
  on public.transportation_items;

create trigger set_transportation_item_created_by_before_insert
before insert on public.transportation_items
for each row
execute function public.set_transportation_item_created_by();;
