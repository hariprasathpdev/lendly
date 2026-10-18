alter table public.profiles add column terms_accepted_at timestamptz;

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare matched_college uuid; user_domain text; display_name text; terms_time timestamptz;
begin
  if new.email is null or position('@' in new.email)<2 then raise exception 'A college email is required'; end if;
  user_domain=lower(split_part(new.email,'@',2));
  select d.college_id into matched_college from public.college_email_domains d join public.colleges c on c.id=d.college_id where d.domain=user_domain and c.active=true;
  if matched_college is null then raise exception 'This email domain is not approved'; end if;
  display_name=coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'New student');
  terms_time=nullif(new.raw_user_meta_data->>'terms_accepted_at','')::timestamptz;
  insert into public.profiles(id,college_id,full_name,college_email,email_verified_at,terms_accepted_at)
  values(new.id,matched_college,display_name,lower(new.email),new.email_confirmed_at,terms_time);
  return new;
end $$;
