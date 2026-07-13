drop policy if exists "Users can view their own news feed posts"
on public.news_feed_posts;

drop policy if exists "Users can view accessible news feed posts"
on public.news_feed_posts;

create policy "Users can view accessible news feed posts"
on public.news_feed_posts
for select
to authenticated
using (
  audience_user_id = (select auth.uid())
  or user_id = (select auth.uid())
  or actor_user_id = (select auth.uid())
  or exists (
    select 1
    from public.user_friendships friendships
    where friendships.status = 'accepted'
      and (
        (
          friendships.requester_user_id = (select auth.uid())
          and friendships.addressee_user_id = coalesce(
            news_feed_posts.actor_user_id,
            news_feed_posts.user_id
          )
        )
        or (
          friendships.addressee_user_id = (select auth.uid())
          and friendships.requester_user_id = coalesce(
            news_feed_posts.actor_user_id,
            news_feed_posts.user_id
          )
        )
      )
  )
);

drop policy if exists "Authenticated users can view news feed reactions"
on public.news_feed_reactions;

drop policy if exists "Users can view reactions on accessible news feed posts"
on public.news_feed_reactions;

create policy "Users can view reactions on accessible news feed posts"
on public.news_feed_reactions
for select
to authenticated
using (
  post_key = any (
    array[
      'weather-environment-next-trips',
      'travel-advisories-home-country',
      'local-news-trip-cities'
    ]
  )
  or exists (
    select 1
    from public.news_feed_posts posts
    where posts.post_key = news_feed_reactions.post_key
      and posts.archived_at is null
      and (
        posts.audience_user_id = (select auth.uid())
        or posts.user_id = (select auth.uid())
        or posts.actor_user_id = (select auth.uid())
        or exists (
          select 1
          from public.user_friendships friendships
          where friendships.status = 'accepted'
            and (
              (
                friendships.requester_user_id = (select auth.uid())
                and friendships.addressee_user_id = coalesce(
                  posts.actor_user_id,
                  posts.user_id
                )
              )
              or (
                friendships.addressee_user_id = (select auth.uid())
                and friendships.requester_user_id = coalesce(
                  posts.actor_user_id,
                  posts.user_id
                )
              )
            )
        )
      )
  )
);
