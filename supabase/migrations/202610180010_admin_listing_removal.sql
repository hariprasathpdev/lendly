create or replace function public.remove_approved_listing(
  p_listing_id uuid,
  p_admin_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  admin_college uuid;
  listing_row public.listings%rowtype;
begin
  select college_id into admin_college from public.profiles
  where id=p_admin_id and role='admin';
  if admin_college is null then
    raise exception 'ADMIN_ACCESS_REQUIRED' using errcode='42501';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 2 and 1000 then
    raise exception 'LISTING_REMOVAL_REASON_REQUIRED' using errcode='22023';
  end if;

  select l.* into listing_row
  from public.listings l
  join public.profiles owner_profile on owner_profile.id=l.owner_id
  where l.id=p_listing_id and owner_profile.college_id=admin_college
  for update of l;
  if not found then raise exception 'LISTING_NOT_FOUND' using errcode='P0002'; end if;
  if listing_row.status<>'approved' then
    raise exception 'LISTING_NOT_REMOVABLE' using errcode='P0001';
  end if;
  if exists (
    select 1 from public.bookings
    where listing_id=listing_row.id
      and status in ('pending','accepted','awaiting_payment','confirmed','active','return_requested','disputed')
  ) then
    raise exception 'LISTING_HAS_ACTIVE_BOOKINGS' using errcode='P0001';
  end if;

  update public.listings set status='archived' where id=listing_row.id;
  insert into public.admin_audit_logs(admin_id,action,target_type,target_id,metadata)
  values(p_admin_id,'listing.remove','listing',listing_row.id,
    jsonb_build_object('reason',trim(p_reason),'previousStatus',listing_row.status,'status','archived'));
  insert into public.notifications(user_id,type,title,body,related_type,related_id)
  values(listing_row.owner_id,'listing_removed','Listing removed from campus marketplace',
    'An administrator removed your approved listing: '||trim(p_reason),'listing',listing_row.id);
  return jsonb_build_object('id',listing_row.id,'status','archived');
end;
$$;

revoke all on function public.remove_approved_listing(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.remove_approved_listing(uuid,uuid,text) to service_role;
