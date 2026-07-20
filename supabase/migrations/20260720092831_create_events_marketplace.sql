create extension if not exists pgcrypto with schema extensions;

alter table public.user_profiles
drop constraint if exists user_profiles_role_check;

alter table public.user_profiles
add constraint user_profiles_role_check
check (role in ('basic_user', 'event_organizer', 'super_admin'));

create table public.events (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null references auth.users(id) on delete restrict,
    slug text not null,
    title text not null,
    short_summary text,
    description text,
    category text,
    tags text[] not null default '{}',
    cover_image_storage_path text,
    cover_image_alt text,
    status text not null default 'draft'
        check (status in ('draft', 'scheduled', 'published', 'cancelled', 'completed', 'archived')),
    visibility text not null default 'public'
        check (visibility in ('public', 'private')),
    registration_mode text not null default 'rsvp'
        check (registration_mode in ('rsvp', 'ticketed')),
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    timezone text not null default 'UTC',
    venue_type text not null default 'physical'
        check (venue_type in ('physical', 'online')),
    venue_name text,
    address_line text,
    city text,
    region text,
    country text,
    postal_code text,
    google_place_id text,
    latitude double precision,
    longitude double precision,
    organizer_display_name text,
    organizer_contact_email text,
    accessibility_info text,
    attendee_notes text,
    age_restriction text,
    refund_policy text,
    overall_capacity integer check (overall_capacity is null or overall_capacity > 0),
    publish_at timestamptz,
    published_at timestamptz,
    cancelled_at timestamptz,
    archived_at timestamptz,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint events_slug_format_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    constraint events_slug_unique unique (slug),
    constraint events_date_order_check check (ends_at > starts_at),
    constraint events_coordinates_check check (
        (latitude is null and longitude is null)
        or (latitude between -90 and 90 and longitude between -180 and 180)
    )
);

create table public.event_private_details (
    event_id uuid primary key references public.events(id) on delete cascade,
    online_url text,
    internal_notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.event_audit_log (
    id uuid primary key default gen_random_uuid(),
    event_id uuid references public.events(id) on delete set null,
    actor_user_id uuid references auth.users(id) on delete set null,
    action text not null,
    subject_type text,
    subject_id uuid,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table public.event_team_members (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'manager' check (role in ('manager', 'check_in')),
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    unique (event_id, user_id)
);

create table public.event_ticket_types (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    name text not null,
    description text,
    price_minor integer not null default 0 check (price_minor >= 0),
    fee_minor integer not null default 0 check (fee_minor >= 0),
    tax_minor integer not null default 0 check (tax_minor >= 0),
    currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
    total_quantity integer not null check (total_quantity >= 0),
    quantity_held integer not null default 0 check (quantity_held >= 0),
    quantity_sold integer not null default 0 check (quantity_sold >= 0),
    sales_start_at timestamptz,
    sales_end_at timestamptz,
    min_per_order integer not null default 1 check (min_per_order > 0),
    max_per_order integer not null default 10 check (max_per_order > 0),
    max_per_customer integer check (max_per_customer is null or max_per_customer > 0),
    display_order integer not null default 0,
    state text not null default 'active'
        check (state in ('active', 'hidden', 'sold_out', 'archived')),
    attendee_instructions text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint event_ticket_types_order_limits_check check (max_per_order >= min_per_order),
    constraint event_ticket_types_inventory_check check (
        quantity_held + quantity_sold <= total_quantity
    )
);

create table public.event_orders (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete restrict,
    user_id uuid not null references auth.users(id) on delete restrict,
    status text not null default 'pending'
        check (status in ('pending', 'paid', 'free', 'failed', 'expired', 'cancelled', 'refunded', 'disputed')),
    currency text not null check (currency ~ '^[A-Z]{3}$'),
    subtotal_minor integer not null default 0 check (subtotal_minor >= 0),
    fee_minor integer not null default 0 check (fee_minor >= 0),
    tax_minor integer not null default 0 check (tax_minor >= 0),
    total_minor integer not null default 0 check (total_minor >= 0),
    idempotency_key uuid not null,
    stripe_checkout_session_id text unique,
    stripe_payment_intent_id text unique,
    stripe_charge_id text,
    hold_expires_at timestamptz,
    paid_at timestamptz,
    failed_at timestamptz,
    refunded_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, idempotency_key)
);

create table public.event_order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.event_orders(id) on delete restrict,
    event_id uuid not null references public.events(id) on delete restrict,
    ticket_type_id uuid not null references public.event_ticket_types(id) on delete restrict,
    ticket_name_snapshot text not null,
    description_snapshot text,
    unit_price_minor integer not null check (unit_price_minor >= 0),
    unit_fee_minor integer not null default 0 check (unit_fee_minor >= 0),
    unit_tax_minor integer not null default 0 check (unit_tax_minor >= 0),
    currency text not null check (currency ~ '^[A-Z]{3}$'),
    quantity integer not null check (quantity > 0),
    created_at timestamptz not null default now()
);

create table public.event_tickets (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete restrict,
    ticket_type_id uuid not null references public.event_ticket_types(id) on delete restrict,
    order_id uuid not null references public.event_orders(id) on delete restrict,
    order_item_id uuid not null references public.event_order_items(id) on delete restrict,
    owner_user_id uuid not null references auth.users(id) on delete restrict,
    ticket_number text not null unique,
    attendee_name text not null,
    attendee_email text not null,
    redemption_hash text not null unique,
    status text not null default 'active'
        check (status in ('active', 'checked_in', 'cancelled', 'refunded', 'void')),
    issued_at timestamptz not null default now(),
    checked_in_at timestamptz,
    checked_in_by uuid references auth.users(id) on delete set null,
    voided_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (order_item_id, ticket_number)
);

create schema if not exists private;

create table private.event_ticket_secrets (
    ticket_id uuid primary key references public.event_tickets(id) on delete cascade,
    redemption_secret text not null unique,
    created_at timestamptz not null default now()
);

create table public.event_rsvps (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
    attendee_name text,
    attendee_email text,
    confirmed_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (event_id, user_id)
);

create table public.saved_events (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (event_id, user_id)
);

create table public.event_invitations (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    email_normalized text not null,
    token_hash text not null unique,
    status text not null default 'pending'
        check (status in ('pending', 'accepted', 'expired', 'revoked')),
    invited_by uuid not null references auth.users(id) on delete restrict,
    accepted_by uuid references auth.users(id) on delete set null,
    expires_at timestamptz,
    accepted_at timestamptz,
    revoked_at timestamptz,
    last_sent_at timestamptz,
    send_count integer not null default 0 check (send_count >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (event_id, email_normalized)
);

create table public.event_check_ins (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete restrict,
    ticket_id uuid not null references public.event_tickets(id) on delete restrict,
    checked_in_by uuid not null references auth.users(id) on delete restrict,
    checked_in_at timestamptz not null default now(),
    undone_by uuid references auth.users(id) on delete set null,
    undone_at timestamptz,
    created_at timestamptz not null default now()
);

create unique index event_check_ins_active_ticket_idx
on public.event_check_ins(ticket_id)
where undone_at is null;

create table public.event_webhook_events (
    id uuid primary key default gen_random_uuid(),
    provider text not null default 'stripe',
    provider_event_id text not null,
    event_type text not null,
    processing_status text not null default 'processing'
        check (processing_status in ('processing', 'processed', 'failed')),
    order_id uuid references public.event_orders(id) on delete set null,
    error_code text,
    processed_at timestamptz,
    created_at timestamptz not null default now(),
    unique (provider, provider_event_id)
);

create index events_marketplace_idx
on public.events(starts_at, category, city)
where status = 'published' and visibility = 'public' and deleted_at is null;
create index events_owner_status_idx on public.events(owner_user_id, status, starts_at desc);
create index events_publish_schedule_idx on public.events(publish_at) where status = 'scheduled';
create index event_team_members_user_idx on public.event_team_members(user_id, event_id);
create index event_ticket_types_event_idx on public.event_ticket_types(event_id, display_order);
create index event_orders_user_idx on public.event_orders(user_id, created_at desc);
create index event_orders_event_idx on public.event_orders(event_id, status, created_at desc);
create index event_orders_hold_idx on public.event_orders(hold_expires_at) where status = 'pending';
create index event_order_items_order_idx on public.event_order_items(order_id);
create index event_tickets_owner_idx on public.event_tickets(owner_user_id, status, issued_at desc);
create index event_tickets_event_idx on public.event_tickets(event_id, status);
create index event_rsvps_user_idx on public.event_rsvps(user_id, status, created_at desc);
create index event_rsvps_event_idx on public.event_rsvps(event_id, status);
create index saved_events_user_idx on public.saved_events(user_id, created_at desc);
create index event_invitations_email_idx on public.event_invitations(email_normalized, status);
create index event_invitations_event_idx on public.event_invitations(event_id, status);
create index event_check_ins_event_idx on public.event_check_ins(event_id, checked_in_at desc);
create index event_audit_log_event_idx on public.event_audit_log(event_id, created_at desc);

create or replace function public.event_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger events_set_updated_at before update on public.events
for each row execute function public.event_set_updated_at();
create trigger event_private_details_set_updated_at before update on public.event_private_details
for each row execute function public.event_set_updated_at();
create trigger event_ticket_types_set_updated_at before update on public.event_ticket_types
for each row execute function public.event_set_updated_at();
create trigger event_orders_set_updated_at before update on public.event_orders
for each row execute function public.event_set_updated_at();
create trigger event_tickets_set_updated_at before update on public.event_tickets
for each row execute function public.event_set_updated_at();
create trigger event_rsvps_set_updated_at before update on public.event_rsvps
for each row execute function public.event_set_updated_at();
create trigger event_invitations_set_updated_at before update on public.event_invitations
for each row execute function public.event_set_updated_at();

create or replace function public.is_event_organizer()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
    select exists (
        select 1 from public.user_profiles
        where id = auth.uid() and role in ('event_organizer', 'super_admin')
    );
$$;

create or replace function public.event_user_can_manage(
    target_event_id uuid,
    target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
    select exists (
        select 1
        from public.user_profiles profile
        where profile.id = target_user_id
          and profile.role = 'super_admin'
    ) or exists (
        select 1
        from public.events event_row
        join public.user_profiles profile on profile.id = target_user_id
        where event_row.id = target_event_id
          and event_row.owner_user_id = target_user_id
          and profile.role = 'event_organizer'
    ) or exists (
        select 1
        from public.event_team_members member
        join public.user_profiles profile on profile.id = target_user_id
        where member.event_id = target_event_id
          and member.user_id = target_user_id
          and profile.role in ('event_organizer', 'super_admin')
    );
$$;

create or replace function public.event_user_can_view(
    target_event_id uuid,
    target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
    select exists (
        select 1 from public.events event_row
        where event_row.id = target_event_id
          and event_row.deleted_at is null
          and (
            (
              event_row.status = 'published'
              and event_row.visibility = 'public'
              and coalesce(event_row.publish_at, event_row.published_at, '-infinity'::timestamptz) <= now()
            )
            or public.event_user_can_manage(event_row.id, target_user_id)
            or exists (
                select 1 from public.event_tickets ticket
                where ticket.event_id = event_row.id and ticket.owner_user_id = target_user_id
            )
            or exists (
                select 1 from public.event_rsvps rsvp
                where rsvp.event_id = event_row.id
                  and rsvp.user_id = target_user_id and rsvp.status = 'confirmed'
            )
            or exists (
                select 1 from public.event_invitations invitation
                where invitation.event_id = event_row.id
                  and invitation.status in ('pending', 'accepted')
                  and invitation.email_normalized = lower(coalesce(auth.jwt() ->> 'email', ''))
                  and (invitation.expires_at is null or invitation.expires_at > now())
            )
          )
    );
$$;

create or replace function public.event_issue_order_tickets(target_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, private, auth, extensions
as $$
declare
    order_row public.event_orders%rowtype;
    item_row public.event_order_items%rowtype;
    profile_row record;
    ticket_id uuid;
    ticket_secret text;
    ticket_number text;
    issued_count integer := 0;
    item_index integer;
begin
    select * into order_row from public.event_orders where id = target_order_id for update;
    if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
    if order_row.status not in ('paid', 'free') then
        raise exception 'Order is not eligible for ticket issuance' using errcode = '22023';
    end if;

    select
        coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), username, email, 'VAIVIA guest') as attendee_name,
        coalesce(email, auth_user.email, '') as attendee_email
    into profile_row
    from public.user_profiles profile
    left join auth.users auth_user on auth_user.id = profile.id
    where profile.id = order_row.user_id;

    for item_row in select * from public.event_order_items where order_id = order_row.id order by id
    loop
        for item_index in 1..item_row.quantity loop
            if exists (
                select 1 from public.event_tickets
                where order_item_id = item_row.id
                offset item_index - 1 limit 1
            ) then
                continue;
            end if;

            ticket_id := gen_random_uuid();
            ticket_secret := encode(gen_random_bytes(32), 'hex');
            ticket_number := 'VAE-' || upper(substr(replace(ticket_id::text, '-', ''), 1, 12));

            insert into public.event_tickets (
                id, event_id, ticket_type_id, order_id, order_item_id,
                owner_user_id, ticket_number, attendee_name, attendee_email, redemption_hash
            ) values (
                ticket_id, order_row.event_id, item_row.ticket_type_id, order_row.id, item_row.id,
                order_row.user_id, ticket_number, coalesce(profile_row.attendee_name, 'VAIVIA guest'),
                coalesce(profile_row.attendee_email, ''), encode(digest(ticket_secret, 'sha256'), 'hex')
            );

            insert into private.event_ticket_secrets(ticket_id, redemption_secret)
            values (ticket_id, ticket_secret);
            issued_count := issued_count + 1;
        end loop;
    end loop;
    return issued_count;
end;
$$;

create or replace function public.reserve_event_order(
    selections jsonb,
    request_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, extensions
as $$
declare
    current_user_id uuid := auth.uid();
    existing_order public.event_orders%rowtype;
    order_id uuid := gen_random_uuid();
    selected record;
    tier public.event_ticket_types%rowtype;
    selected_event_id uuid;
    selected_currency text;
    subtotal integer := 0;
    fees integer := 0;
    taxes integer := 0;
    total integer := 0;
    is_paid boolean;
    hold_until timestamptz := now() + interval '30 minutes';
    prior_quantity integer;
begin
    if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    if request_idempotency_key is null then raise exception 'Idempotency key required' using errcode = '22023'; end if;
    if jsonb_typeof(selections) <> 'array' or jsonb_array_length(selections) < 1 or jsonb_array_length(selections) > 20 then
        raise exception 'Select between one and twenty ticket tiers' using errcode = '22023';
    end if;
    if (select count(*) from jsonb_to_recordset(selections) as x(ticket_type_id uuid, quantity integer))
       <> (select count(distinct ticket_type_id) from jsonb_to_recordset(selections) as x(ticket_type_id uuid, quantity integer)) then
        raise exception 'Duplicate ticket tier selection' using errcode = '22023';
    end if;

    select * into existing_order
    from public.event_orders
    where user_id = current_user_id and idempotency_key = request_idempotency_key;
    if found then
        return jsonb_build_object(
            'order_id', existing_order.id,
            'status', existing_order.status,
            'total_minor', existing_order.total_minor,
            'currency', existing_order.currency,
            'requires_payment', existing_order.total_minor > 0,
            'hold_expires_at', existing_order.hold_expires_at
        );
    end if;

    for selected in
        select ticket_type_id, quantity
        from jsonb_to_recordset(selections) as x(ticket_type_id uuid, quantity integer)
        order by ticket_type_id
    loop
        if selected.ticket_type_id is null or selected.quantity is null or selected.quantity <= 0 then
            raise exception 'Invalid ticket selection' using errcode = '22023';
        end if;
        select * into tier from public.event_ticket_types where id = selected.ticket_type_id for update;
        if not found or tier.state <> 'active' then raise exception 'Ticket tier is unavailable' using errcode = '22023'; end if;
        if selected.quantity < tier.min_per_order or selected.quantity > tier.max_per_order then
            raise exception 'Ticket quantity is outside tier limits' using errcode = '22023';
        end if;
        if tier.sales_start_at is not null and tier.sales_start_at > now() then raise exception 'Ticket sales have not started' using errcode = '22023'; end if;
        if tier.sales_end_at is not null and tier.sales_end_at < now() then raise exception 'Ticket sales have ended' using errcode = '22023'; end if;
        if tier.quantity_sold + tier.quantity_held + selected.quantity > tier.total_quantity then
            raise exception 'Insufficient ticket inventory' using errcode = 'P0001';
        end if;
        if selected_event_id is null then
            selected_event_id := tier.event_id;
            selected_currency := tier.currency;
        elsif selected_event_id <> tier.event_id or selected_currency <> tier.currency then
            raise exception 'All ticket selections must belong to one event and currency' using errcode = '22023';
        end if;
        if not public.event_user_can_view(tier.event_id, current_user_id) then
            raise exception 'Event is unavailable' using errcode = '42501';
        end if;
        if tier.max_per_customer is not null then
            select coalesce(sum(item.quantity), 0) into prior_quantity
            from public.event_order_items item
            join public.event_orders existing on existing.id = item.order_id
            where existing.user_id = current_user_id
              and item.ticket_type_id = tier.id
              and existing.status in ('pending', 'paid', 'free');
            if prior_quantity + selected.quantity > tier.max_per_customer then
                raise exception 'Customer ticket limit exceeded' using errcode = '22023';
            end if;
        end if;
        subtotal := subtotal + tier.price_minor * selected.quantity;
        fees := fees + tier.fee_minor * selected.quantity;
        taxes := taxes + tier.tax_minor * selected.quantity;
    end loop;

    select subtotal + fees + taxes into total;
    is_paid := total > 0;
    insert into public.event_orders (
        id, event_id, user_id, status, currency, subtotal_minor, fee_minor,
        tax_minor, total_minor, idempotency_key, hold_expires_at, paid_at
    ) values (
        order_id, selected_event_id, current_user_id, case when is_paid then 'pending' else 'free' end,
        selected_currency, subtotal, fees, taxes, total, request_idempotency_key,
        case when is_paid then hold_until else null end, case when is_paid then null else now() end
    );

    for selected in
        select ticket_type_id, quantity
        from jsonb_to_recordset(selections) as x(ticket_type_id uuid, quantity integer)
        order by ticket_type_id
    loop
        select * into tier from public.event_ticket_types where id = selected.ticket_type_id for update;
        insert into public.event_order_items (
            order_id, event_id, ticket_type_id, ticket_name_snapshot, description_snapshot,
            unit_price_minor, unit_fee_minor, unit_tax_minor, currency, quantity
        ) values (
            order_id, tier.event_id, tier.id, tier.name, tier.description,
            tier.price_minor, tier.fee_minor, tier.tax_minor, tier.currency, selected.quantity
        );
        update public.event_ticket_types
        set quantity_held = quantity_held + case when is_paid then selected.quantity else 0 end,
            quantity_sold = quantity_sold + case when is_paid then 0 else selected.quantity end
        where id = tier.id;
    end loop;

    if not is_paid then perform public.event_issue_order_tickets(order_id); end if;
    insert into public.event_audit_log(event_id, actor_user_id, action, subject_type, subject_id)
    values (selected_event_id, current_user_id, case when is_paid then 'order_reserved' else 'free_tickets_issued' end, 'event_order', order_id);

    return jsonb_build_object(
        'order_id', order_id,
        'status', case when is_paid then 'pending' else 'free' end,
        'total_minor', total,
        'currency', selected_currency,
        'requires_payment', is_paid,
        'hold_expires_at', case when is_paid then hold_until else null end
    );
end;
$$;

create or replace function public.finalize_event_order(
    target_order_id uuid,
    provider_checkout_session_id text,
    provider_payment_intent_id text default null,
    provider_charge_id text default null
)
returns integer
language plpgsql
security definer
set search_path = public, private, auth, extensions
as $$
declare
    order_row public.event_orders%rowtype;
    item_row public.event_order_items%rowtype;
    issued integer;
begin
    select * into order_row from public.event_orders where id = target_order_id for update;
    if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
    if order_row.status = 'paid' then return 0; end if;
    if order_row.status <> 'pending' then raise exception 'Order cannot be finalized' using errcode = '22023'; end if;
    for item_row in select * from public.event_order_items where order_id = order_row.id order by ticket_type_id for update
    loop
        update public.event_ticket_types
        set quantity_held = quantity_held - item_row.quantity,
            quantity_sold = quantity_sold + item_row.quantity
        where id = item_row.ticket_type_id and quantity_held >= item_row.quantity;
        if not found then raise exception 'Inventory hold is inconsistent' using errcode = 'P0001'; end if;
    end loop;
    update public.event_orders set
        status = 'paid', paid_at = now(), hold_expires_at = null,
        stripe_checkout_session_id = coalesce(provider_checkout_session_id, stripe_checkout_session_id),
        stripe_payment_intent_id = coalesce(provider_payment_intent_id, stripe_payment_intent_id),
        stripe_charge_id = coalesce(provider_charge_id, stripe_charge_id)
    where id = order_row.id;
    issued := public.event_issue_order_tickets(order_row.id);
    insert into public.event_audit_log(event_id, action, subject_type, subject_id, metadata)
    values (order_row.event_id, 'paid_order_finalized', 'event_order', order_row.id, jsonb_build_object('tickets_issued', issued));
    return issued;
end;
$$;

create or replace function public.release_event_order_hold(target_order_id uuid, release_status text default 'expired')
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    order_row public.event_orders%rowtype;
    item_row public.event_order_items%rowtype;
begin
    if release_status not in ('expired', 'failed', 'cancelled') then raise exception 'Invalid release status'; end if;
    select * into order_row from public.event_orders where id = target_order_id for update;
    if not found or order_row.status <> 'pending' then return false; end if;
    for item_row in select * from public.event_order_items where order_id = order_row.id order by ticket_type_id for update
    loop
        update public.event_ticket_types
        set quantity_held = greatest(0, quantity_held - item_row.quantity)
        where id = item_row.ticket_type_id;
    end loop;
    update public.event_orders set status = release_status,
        failed_at = case when release_status = 'failed' then now() else failed_at end,
        hold_expires_at = null where id = order_row.id;
    insert into public.event_audit_log(event_id, action, subject_type, subject_id)
    values (order_row.event_id, 'order_' || release_status, 'event_order', order_row.id);
    return true;
end;
$$;

create or replace function public.refund_event_order(target_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    order_row public.event_orders%rowtype;
    item_row public.event_order_items%rowtype;
    voided_count integer;
begin
    select * into order_row from public.event_orders where id = target_order_id for update;
    if not found then return 0; end if;
    if order_row.status = 'refunded' then return 0; end if;
    if order_row.status not in ('paid', 'disputed') then raise exception 'Order is not refundable'; end if;
    for item_row in select * from public.event_order_items where order_id = order_row.id order by ticket_type_id for update
    loop
        update public.event_ticket_types set quantity_sold = greatest(0, quantity_sold - item_row.quantity)
        where id = item_row.ticket_type_id;
    end loop;
    update public.event_tickets set status = 'refunded', voided_at = now()
    where order_id = order_row.id and status in ('active', 'checked_in');
    get diagnostics voided_count = row_count;
    update public.event_orders set status = 'refunded', refunded_at = now() where id = order_row.id;
    insert into public.event_audit_log(event_id, action, subject_type, subject_id, metadata)
    values (order_row.event_id, 'order_refunded', 'event_order', order_row.id, jsonb_build_object('tickets_voided', voided_count));
    return voided_count;
end;
$$;

create or replace function public.register_event_rsvp(target_event_id uuid, attendee_name_input text default null)
returns public.event_rsvps
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid := auth.uid();
    event_row public.events%rowtype;
    result public.event_rsvps%rowtype;
    confirmed_count integer;
    user_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
    if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    select * into event_row from public.events where id = target_event_id for update;
    if not found or event_row.registration_mode <> 'rsvp' or not public.event_user_can_view(target_event_id, current_user_id) then
        raise exception 'Event is unavailable' using errcode = '42501';
    end if;
    if event_row.overall_capacity is not null then
        select count(*) into confirmed_count from public.event_rsvps where event_id = target_event_id and status = 'confirmed';
        if confirmed_count >= event_row.overall_capacity and not exists (
            select 1 from public.event_rsvps where event_id = target_event_id and user_id = current_user_id and status = 'confirmed'
        ) then raise exception 'Event is at capacity' using errcode = 'P0001'; end if;
    end if;
    insert into public.event_rsvps(event_id, user_id, status, attendee_name, attendee_email, confirmed_at, cancelled_at)
    values (target_event_id, current_user_id, 'confirmed', nullif(trim(attendee_name_input), ''), user_email, now(), null)
    on conflict (event_id, user_id) do update set
        status = 'confirmed', attendee_name = coalesce(excluded.attendee_name, event_rsvps.attendee_name),
        attendee_email = excluded.attendee_email, confirmed_at = now(), cancelled_at = null
    returning * into result;
    insert into public.event_audit_log(event_id, actor_user_id, action, subject_type, subject_id)
    values (target_event_id, current_user_id, 'rsvp_confirmed', 'event_rsvp', result.id);
    return result;
end;
$$;

create or replace function public.cancel_event_rsvp(target_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare rsvp_id uuid;
begin
    update public.event_rsvps set status = 'cancelled', cancelled_at = now()
    where event_id = target_event_id and user_id = auth.uid() and status = 'confirmed'
    returning id into rsvp_id;
    if rsvp_id is null then return false; end if;
    insert into public.event_audit_log(event_id, actor_user_id, action, subject_type, subject_id)
    values (target_event_id, auth.uid(), 'rsvp_cancelled', 'event_rsvp', rsvp_id);
    return true;
end;
$$;

create or replace function public.claim_event_invitation(target_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare invitation_row public.event_invitations%rowtype;
declare user_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
    if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
    select * into invitation_row from public.event_invitations where token_hash = target_token_hash for update;
    if not found or invitation_row.status not in ('pending', 'accepted') or
       (invitation_row.expires_at is not null and invitation_row.expires_at <= now()) then
        raise exception 'Invitation is invalid or expired' using errcode = '22023';
    end if;
    if invitation_row.email_normalized <> user_email then raise exception 'Invitation email does not match' using errcode = '42501'; end if;
    update public.event_invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
    where id = invitation_row.id;
    insert into public.event_audit_log(event_id, actor_user_id, action, subject_type, subject_id)
    values (invitation_row.event_id, auth.uid(), 'invitation_accepted', 'event_invitation', invitation_row.id);
    return invitation_row.event_id;
end;
$$;

create or replace function public.check_in_event_ticket(
    target_event_id uuid,
    target_redemption_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare ticket_row public.event_tickets%rowtype;
declare check_in_id uuid;
begin
    if not public.event_user_can_manage(target_event_id, auth.uid()) then raise exception 'Not authorized' using errcode = '42501'; end if;
    select * into ticket_row from public.event_tickets where redemption_hash = target_redemption_hash for update;
    if not found then return jsonb_build_object('result', 'invalid'); end if;
    if ticket_row.event_id <> target_event_id then return jsonb_build_object('result', 'wrong_event'); end if;
    if ticket_row.status = 'checked_in' then
        return jsonb_build_object('result', 'already_used', 'checked_in_at', ticket_row.checked_in_at);
    end if;
    if ticket_row.status <> 'active' then return jsonb_build_object('result', ticket_row.status); end if;
    insert into public.event_check_ins(event_id, ticket_id, checked_in_by)
    values (target_event_id, ticket_row.id, auth.uid()) returning id into check_in_id;
    update public.event_tickets set status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid()
    where id = ticket_row.id;
    insert into public.event_audit_log(event_id, actor_user_id, action, subject_type, subject_id)
    values (target_event_id, auth.uid(), 'ticket_checked_in', 'event_ticket', ticket_row.id);
    return jsonb_build_object('result', 'checked_in', 'ticket_id', ticket_row.id, 'check_in_id', check_in_id);
end;
$$;

create or replace function public.undo_event_ticket_check_in(target_ticket_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare ticket_row public.event_tickets%rowtype;
begin
    select * into ticket_row from public.event_tickets where id = target_ticket_id for update;
    if not found or not public.event_user_can_manage(ticket_row.event_id, auth.uid()) then raise exception 'Not authorized' using errcode = '42501'; end if;
    if ticket_row.status <> 'checked_in' then return false; end if;
    update public.event_check_ins set undone_at = now(), undone_by = auth.uid()
    where ticket_id = ticket_row.id and undone_at is null;
    update public.event_tickets set status = 'active', checked_in_at = null, checked_in_by = null where id = ticket_row.id;
    insert into public.event_audit_log(event_id, actor_user_id, action, subject_type, subject_id)
    values (ticket_row.event_id, auth.uid(), 'ticket_check_in_undone', 'event_ticket', ticket_row.id);
    return true;
end;
$$;

create or replace function public.admin_update_user_profile(
    target_user_id uuid,
    target_first_name text,
    target_last_name text,
    target_username text,
    target_email text,
    target_role text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
    normalized_role text := coalesce(nullif(trim(target_role), ''), 'basic_user');
    previous_role text;
begin
    if not public.is_super_admin() then raise exception 'Only super admins can update users' using errcode = '42501'; end if;
    if normalized_role not in ('basic_user', 'event_organizer', 'super_admin') then raise exception 'Invalid user role' using errcode = '22023'; end if;
    select role into previous_role from public.user_profiles where id = target_user_id for update;
    if not found then raise exception 'User profile not found' using errcode = 'P0002'; end if;
    update public.user_profiles set
        first_name = nullif(trim(target_first_name), ''), last_name = nullif(trim(target_last_name), ''),
        username = nullif(trim(target_username), ''), email = nullif(trim(target_email), ''),
        role = normalized_role, updated_at = now()
    where id = target_user_id;
    if previous_role is distinct from normalized_role then
        insert into public.event_audit_log(actor_user_id, action, subject_type, subject_id, metadata)
        values (auth.uid(), 'global_event_role_changed', 'user_profile', target_user_id,
            jsonb_build_object('from', previous_role, 'to', normalized_role));
    end if;
end;
$$;

alter table public.events enable row level security;
alter table public.event_private_details enable row level security;
alter table public.event_audit_log enable row level security;
alter table public.event_team_members enable row level security;
alter table public.event_ticket_types enable row level security;
alter table public.event_orders enable row level security;
alter table public.event_order_items enable row level security;
alter table public.event_tickets enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.saved_events enable row level security;
alter table public.event_invitations enable row level security;
alter table public.event_check_ins enable row level security;
alter table public.event_webhook_events enable row level security;
alter table public.event_audit_log force row level security;

create policy events_public_read on public.events for select to anon
using (status = 'published' and visibility = 'public' and deleted_at is null
    and coalesce(publish_at, published_at, '-infinity'::timestamptz) <= now());
create policy events_authenticated_read on public.events for select to authenticated
using (public.event_user_can_view(id, auth.uid()));
create policy events_organizer_insert on public.events for insert to authenticated
with check (owner_user_id = auth.uid() and public.is_event_organizer());
create policy events_organizer_update on public.events for update to authenticated
using (public.event_user_can_manage(id, auth.uid()))
with check (public.event_user_can_manage(id, auth.uid()));

create policy event_private_details_eligible_read on public.event_private_details for select to authenticated
using (public.event_user_can_manage(event_id, auth.uid()) or exists (
    select 1 from public.event_tickets where event_tickets.event_id = event_private_details.event_id
    and event_tickets.owner_user_id = auth.uid() and event_tickets.status in ('active', 'checked_in')
) or exists (
    select 1 from public.event_rsvps where event_rsvps.event_id = event_private_details.event_id
    and event_rsvps.user_id = auth.uid() and event_rsvps.status = 'confirmed'
));
create policy event_private_details_manage on public.event_private_details for all to authenticated
using (public.event_user_can_manage(event_id, auth.uid()))
with check (public.event_user_can_manage(event_id, auth.uid()));

create policy event_team_members_manage_read on public.event_team_members for select to authenticated
using (public.event_user_can_manage(event_id, auth.uid()) or user_id = auth.uid());
create policy event_team_members_manage_write on public.event_team_members for all to authenticated
using (public.event_user_can_manage(event_id, auth.uid()))
with check (public.event_user_can_manage(event_id, auth.uid()));

create policy event_ticket_types_visible_read on public.event_ticket_types for select to anon, authenticated
using (public.event_user_can_view(event_id, auth.uid()));
create policy event_ticket_types_manage on public.event_ticket_types for all to authenticated
using (public.event_user_can_manage(event_id, auth.uid()))
with check (public.event_user_can_manage(event_id, auth.uid()));

create policy event_orders_owner_read on public.event_orders for select to authenticated
using (user_id = auth.uid() or public.event_user_can_manage(event_id, auth.uid()));
create policy event_order_items_owner_read on public.event_order_items for select to authenticated
using (exists (select 1 from public.event_orders where event_orders.id = event_order_items.order_id
    and (event_orders.user_id = auth.uid() or public.event_user_can_manage(event_orders.event_id, auth.uid()))));
create policy event_tickets_owner_read on public.event_tickets for select to authenticated
using (owner_user_id = auth.uid() or public.event_user_can_manage(event_id, auth.uid()));

create policy event_rsvps_owner_read on public.event_rsvps for select to authenticated
using (user_id = auth.uid() or public.event_user_can_manage(event_id, auth.uid()));
create policy saved_events_owner_read on public.saved_events for select to authenticated using (user_id = auth.uid());
create policy saved_events_owner_insert on public.saved_events for insert to authenticated
with check (user_id = auth.uid() and exists (
    select 1 from public.events where events.id = saved_events.event_id
    and events.status = 'published' and events.visibility = 'public' and events.deleted_at is null
));
create policy saved_events_owner_delete on public.saved_events for delete to authenticated using (user_id = auth.uid());

create policy event_invitations_recipient_or_manager_read on public.event_invitations for select to authenticated
using (public.event_user_can_manage(event_id, auth.uid()) or email_normalized = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy event_check_ins_manager_read on public.event_check_ins for select to authenticated
using (public.event_user_can_manage(event_id, auth.uid()));
create policy event_audit_log_manager_read on public.event_audit_log for select to authenticated
using (
    (event_id is not null and public.event_user_can_manage(event_id, auth.uid()))
    or (event_id is null and public.is_super_admin())
);
create policy event_audit_log_manager_insert on public.event_audit_log for insert to authenticated
with check (actor_user_id = auth.uid() and event_id is not null
    and public.event_user_can_manage(event_id, auth.uid()));

revoke all on public.events, public.event_private_details, public.event_audit_log,
    public.event_team_members, public.event_ticket_types, public.event_orders,
    public.event_order_items, public.event_tickets, public.event_rsvps,
    public.saved_events, public.event_invitations, public.event_check_ins,
    public.event_webhook_events from anon, authenticated;
grant select on public.events to anon, authenticated;
grant select on public.event_ticket_types to anon, authenticated;
grant select, insert, update on public.events to authenticated;
grant select, insert, update, delete on public.event_private_details to authenticated;
grant select, insert, update, delete on public.event_team_members to authenticated;
grant select, insert, update, delete on public.event_ticket_types to authenticated;
grant select on public.event_orders, public.event_order_items, public.event_tickets, public.event_rsvps to authenticated;
grant select, insert, delete on public.saved_events to authenticated;
grant select on public.event_invitations, public.event_check_ins, public.event_audit_log to authenticated;
grant insert on public.event_audit_log to authenticated;
grant all on public.events, public.event_private_details, public.event_audit_log, public.event_team_members,
    public.event_ticket_types, public.event_orders, public.event_order_items, public.event_tickets,
    public.event_rsvps, public.saved_events, public.event_invitations, public.event_check_ins,
    public.event_webhook_events to service_role;
grant usage on schema private to service_role;
grant all on private.event_ticket_secrets to service_role;

revoke all on function public.is_event_organizer() from public;
revoke all on function public.event_user_can_manage(uuid, uuid) from public;
revoke all on function public.event_user_can_view(uuid, uuid) from public;
revoke all on function public.event_issue_order_tickets(uuid) from public;
revoke all on function public.reserve_event_order(jsonb, uuid) from public;
revoke all on function public.finalize_event_order(uuid, text, text, text) from public;
revoke all on function public.release_event_order_hold(uuid, text) from public;
revoke all on function public.refund_event_order(uuid) from public;
revoke all on function public.register_event_rsvp(uuid, text) from public;
revoke all on function public.cancel_event_rsvp(uuid) from public;
revoke all on function public.claim_event_invitation(text) from public;
revoke all on function public.check_in_event_ticket(uuid, text) from public;
revoke all on function public.undo_event_ticket_check_in(uuid) from public;
revoke all on function public.event_set_updated_at() from public;
revoke all on function public.admin_update_user_profile(uuid, text, text, text, text, text) from public;
grant execute on function public.is_event_organizer() to authenticated;
grant execute on function public.event_user_can_manage(uuid, uuid) to authenticated, service_role;
grant execute on function public.event_user_can_view(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.reserve_event_order(jsonb, uuid) to authenticated;
grant execute on function public.register_event_rsvp(uuid, text) to authenticated;
grant execute on function public.cancel_event_rsvp(uuid) to authenticated;
grant execute on function public.claim_event_invitation(text) to authenticated;
grant execute on function public.check_in_event_ticket(uuid, text) to authenticated;
grant execute on function public.undo_event_ticket_check_in(uuid) to authenticated;
grant execute on function public.admin_update_user_profile(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.event_issue_order_tickets(uuid) to service_role;
grant execute on function public.finalize_event_order(uuid, text, text, text) to service_role;
grant execute on function public.release_event_order_hold(uuid, text) to service_role;
grant execute on function public.refund_event_order(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'event-covers', 'event-covers', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy event_cover_managers_read on storage.objects for select to authenticated
using (bucket_id = 'event-covers' and public.event_user_can_manage(((storage.foldername(name))[1])::uuid, auth.uid()));
create policy event_cover_managers_insert on storage.objects for insert to authenticated
with check (bucket_id = 'event-covers' and public.event_user_can_manage(((storage.foldername(name))[1])::uuid, auth.uid()));
create policy event_cover_managers_update on storage.objects for update to authenticated
using (bucket_id = 'event-covers' and public.event_user_can_manage(((storage.foldername(name))[1])::uuid, auth.uid()))
with check (bucket_id = 'event-covers' and public.event_user_can_manage(((storage.foldername(name))[1])::uuid, auth.uid()));
create policy event_cover_managers_delete on storage.objects for delete to authenticated
using (bucket_id = 'event-covers' and public.event_user_can_manage(((storage.foldername(name))[1])::uuid, auth.uid()));

comment on table public.events is 'VAIVIA Events marketplace records, separate from Trips and itinerary entities.';
comment on table private.event_ticket_secrets is 'Server-only QR redemption secrets; browser-readable ticket rows contain only hashes.';
comment on column public.event_orders.total_minor is 'Authoritative total in the currency minor unit; never derived from browser values.';
