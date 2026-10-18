alter table public.listing_photos add constraint listing_photos_position_unique unique(listing_id,position);

create or replace function public.find_available_listing_ids(p_start_date date,p_end_date date,p_college_id uuid)
returns setof uuid language sql stable security definer set search_path=public as $$
  select l.id
  from public.listings l
  join public.profiles owner_profile on owner_profile.id=l.owner_id
  where l.status='approved'
    and owner_profile.college_id=p_college_id
    and (l.available_from is null or l.available_from<=p_start_date)
    and (l.available_until is null or l.available_until>=p_end_date)
    and not exists (
      select 1 from public.bookings b
      where b.listing_id=l.id
        and b.status in ('accepted','awaiting_payment','confirmed','active','return_requested','disputed')
        and b.start_date<=p_end_date and b.end_date>=p_start_date
    );
$$;
revoke all on function public.find_available_listing_ids(date,date,uuid) from public,anon,authenticated;
grant execute on function public.find_available_listing_ids(date,date,uuid) to service_role;

create or replace function public.sync_auth_email_verification() returns trigger
language plpgsql security definer set search_path=public as $$
declare current_college uuid; matched_college uuid; user_domain text;
begin
  if new.email is null or position('@' in new.email)<2 then raise exception 'A college email is required'; end if;
  user_domain=lower(split_part(new.email,'@',2));
  select d.college_id into matched_college from public.college_email_domains d join public.colleges c on c.id=d.college_id where d.domain=user_domain and c.active=true;
  select college_id into current_college from public.profiles where id=new.id;
  if matched_college is null or matched_college<>current_college then raise exception 'Email changes must remain within the approved college'; end if;
  update public.profiles set email_verified_at=new.email_confirmed_at,college_email=lower(new.email)
  where id=new.id and (email_verified_at is distinct from new.email_confirmed_at or college_email is distinct from lower(new.email));
  return new;
end $$;
