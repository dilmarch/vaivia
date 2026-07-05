alter table public.transportation_items
drop constraint if exists transportation_items_status_check;

alter table public.transportation_items
add constraint transportation_items_status_check
check (
    status in (
        'planned',
        'booked',
        'confirmed',
        'cancelled',
        'completed'
    )
);
