create or replace function public.notify_feature_suggestion_implemented()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  notify_when_implemented boolean := true;
  suggestion_title text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status <> 'implemented' or coalesce(old.status, '') = 'implemented' then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  if jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)->'notify_when_implemented') = 'boolean' then
    notify_when_implemented :=
      (coalesce(new.metadata, '{}'::jsonb)->>'notify_when_implemented')::boolean;
  end if;

  if not notify_when_implemented then
    return new;
  end if;

  suggestion_title := coalesce(nullif(btrim(new.title), ''), 'Your VAIVIA request');

  insert into public.notifications (
    user_id,
    actor_user_id,
    type,
    title,
    body,
    metadata
  )
  values (
    new.user_id,
    (select auth.uid()),
    'feature_suggestion_implemented',
    'Feature request implemented',
    suggestion_title || ' is now available in VAIVIA.',
    jsonb_build_object(
      'featureSuggestionId', new.id,
      'suggestionType', new.suggestion_type
    )
  );

  return new;
end;
$$;

revoke all on function public.notify_feature_suggestion_implemented() from public;

drop trigger if exists notify_feature_suggestion_implemented_trigger
  on public.feature_suggestions;

create trigger notify_feature_suggestion_implemented_trigger
after update of status on public.feature_suggestions
for each row
when (new.status = 'implemented' and old.status is distinct from 'implemented')
execute function public.notify_feature_suggestion_implemented();
