-- A stay saved through the shared accommodation mutation used to drop the
-- explicit cost-allocation fields before budget auto-sync. The affected shape
-- is narrow: an equal-split accommodation expense has one split even though
-- its linked stay has multiple persisted participants. Rebuild only those
-- rows from the stay participant selection.
with affected_expenses as (
    select
        expense.id,
        expense.trip_id,
        expense.accommodation_id,
        expense.amount,
        expense.currency,
        expense.exchange_rate_used
    from public.trip_expenses as expense
    where expense.deleted_at is null
      and expense.source_type = 'accommodation'
      and expense.split_method = 'equal'
      and expense.accommodation_id is not null
      and (
          select count(*)
          from public.trip_expense_splits as split
          where split.expense_id = expense.id
      ) = 1
      and (
          select count(*)
          from public.trip_item_participants as participant
          where participant.item_type = 'accommodation'
            and participant.item_id = expense.accommodation_id
      ) > 1
), deleted_splits as (
    delete from public.trip_expense_splits as split
    using affected_expenses as expense
    where split.expense_id = expense.id
    returning split.expense_id
), normalized_payers as (
    update public.trip_expenses as expense
    set paid_by_trip_member_id = member.id,
        updated_at = now()
    from affected_expenses as affected
    join public.trip_members as member
      on member.trip_id = affected.trip_id
    where expense.id = affected.id
      and expense.paid_by_trip_member_id is null
      and expense.paid_by_user_id = member.user_id
    returning expense.id
), participant_rows as (
    select
        expense.*,
        participant.participant_kind,
        participant.trip_member_id,
        participant.user_id,
        participant.invitation_id,
        participant.family_member_id,
        participant.guest_name,
        row_number() over (
            partition by expense.id
            order by participant.created_at, participant.id
        ) as participant_number,
        count(*) over (partition by expense.id) as participant_count
    from affected_expenses as expense
    join public.trip_item_participants as participant
      on participant.item_type = 'accommodation'
     and participant.item_id = expense.accommodation_id
    where exists (
        select 1
        from deleted_splits
        where deleted_splits.expense_id = expense.id
    )
), calculated_splits as (
    select
        participant_rows.*,
        (
            floor(round(amount * 100) / participant_count)
            + case
                when participant_number <= mod(round(amount * 100)::bigint, participant_count)
                    then 1
                else 0
              end
        ) / 100.0 as split_amount
    from participant_rows
)
insert into public.trip_expense_splits (
    expense_id,
    trip_id,
    participant_kind,
    trip_member_id,
    user_id,
    invitation_id,
    family_member_id,
    guest_name,
    split_amount,
    split_percentage,
    currency,
    amount_in_reporting_currency,
    is_included
)
select
    id,
    trip_id,
    case when participant_kind = 'user' then 'member' else participant_kind end,
    trip_member_id,
    user_id,
    invitation_id,
    family_member_id,
    guest_name,
    split_amount,
    null,
    currency,
    round(split_amount * exchange_rate_used, 2),
    true
from calculated_splits;
