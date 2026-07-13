alter table public.feature_suggestions
  drop constraint if exists feature_suggestions_status_check;

alter table public.feature_suggestions
  add constraint feature_suggestions_status_check
  check (
    status in (
      'new',
      'reviewing',
      'planned',
      'open',
      'in_progress',
      'qa',
      'archived',
      'implemented',
      'closed'
    )
  );

update public.feature_suggestions
   set status = case status
     when 'new' then 'open'
     when 'reviewing' then 'in_progress'
     when 'planned' then 'qa'
     else status
   end,
       updated_at = now()
 where status in ('new', 'reviewing', 'planned');

alter table public.feature_suggestions
  drop constraint if exists feature_suggestions_status_check;

alter table public.feature_suggestions
  add constraint feature_suggestions_status_check
  check (
    status in (
      'open',
      'in_progress',
      'qa',
      'archived',
      'implemented',
      'closed'
    )
  );

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type = any (
      array[
        'trip_invite_received',
        'trip_invite_accepted',
        'trip_invite_declined',
        'trip_updated',
        'trip_item_added',
        'trip_item_updated',
        'trip_item_deleted',
        'trip_slug_changed',
        'friend_request_received',
        'friend_request_accepted',
        'passport_stamp_share_received',
        'passport_stamp_share_accepted',
        'passport_stamp_share_declined',
        'passport_stamp_added',
        'feature_suggestion_implemented'
      ]::text[]
    )
  );

alter table public.user_notification_preferences
  drop constraint if exists user_notification_preferences_type_check;

alter table public.user_notification_preferences
  add constraint user_notification_preferences_type_check
  check (
    notification_type = any (
      array[
        'trip_invite_received',
        'trip_invite_accepted',
        'trip_invite_declined',
        'trip_updated',
        'trip_item_added',
        'trip_item_updated',
        'trip_item_deleted',
        'trip_slug_changed',
        'friend_request_received',
        'friend_request_accepted',
        'passport_stamp_share_received',
        'passport_stamp_share_accepted',
        'passport_stamp_share_declined',
        'passport_stamp_added',
        'feature_suggestion_implemented'
      ]::text[]
    )
  );
