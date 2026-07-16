do $$
begin
  execute 'create policy "Idea board member change v3" on public.trip_ideas for update using (public.is_trip_active_member(trip_id) and ((not is_private) or created_by = auth.uid())) with check (public.is_trip_active_member(trip_id) and ((not is_private) or created_by = auth.uid()))';
  execute 'create policy "Idea board member remove v3" on public.trip_ideas for delete using (public.is_trip_active_member(trip_id) and ((not is_private) or created_by = auth.uid()))';
end $$;;
