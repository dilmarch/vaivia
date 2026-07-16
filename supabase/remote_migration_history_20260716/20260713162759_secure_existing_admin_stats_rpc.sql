
revoke all on function public.get_admin_site_stats(date, date) from public, anon;
grant execute on function public.get_admin_site_stats(date, date) to authenticated;
;
