alter table public.feature_suggestions
  alter column status set default 'open';

update public.feature_suggestions
   set status = 'open',
       updated_at = now()
 where status = 'new';
