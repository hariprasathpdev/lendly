create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  matched_college uuid;
  user_domain text;
  display_name text;
begin
  if new.email is null or position('@' in new.email)<2 then
    raise exception 'A college email is required' using errcode='23514';
  end if;
  user_domain=lower(split_part(trim(new.email),'@',2));
  select d.college_id into matched_college
  from public.college_email_domains d
  join public.colleges c on c.id=d.college_id
  where d.domain=user_domain and c.active=true;
  if matched_college is null then
    raise exception 'This email domain is not approved' using errcode='23514';
  end if;
  if coalesce(new.raw_user_meta_data->>'terms_accepted','false')<>'true' then
    raise exception 'Accept the Terms and Privacy Policy to create an account' using errcode='23514';
  end if;
  display_name=nullif(trim(new.raw_user_meta_data->>'full_name'),'');
  if display_name is null or length(display_name) not between 2 and 100 then
    raise exception 'A valid full name is required' using errcode='23514';
  end if;

  insert into public.profiles(id,college_id,full_name,college_email,email_verified_at,terms_accepted_at)
  values(new.id,matched_college,display_name,lower(trim(new.email)),new.email_confirmed_at,now());
  return new;
end $$;

create or replace function public.sync_auth_email_verification() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  user_domain text;
  profile_college uuid;
  email_college uuid;
begin
  if new.email is null or position('@' in new.email)<2 then
    raise exception 'A college email is required' using errcode='23514';
  end if;
  select college_id into profile_college from public.profiles where id=new.id for update;
  if profile_college is null then return new; end if;

  user_domain=lower(split_part(trim(new.email),'@',2));
  select d.college_id into email_college
  from public.college_email_domains d
  join public.colleges c on c.id=d.college_id
  where d.domain=user_domain and c.active=true;
  if email_college is null then
    raise exception 'This email domain is not approved for campus accounts' using errcode='23514';
  end if;
  if email_college is distinct from profile_college then
    raise exception 'Email changes cannot move an account to another campus' using errcode='23514';
  end if;

  update public.profiles set email_verified_at=new.email_confirmed_at, college_email=lower(trim(new.email))
  where id=new.id and (email_verified_at is distinct from new.email_confirmed_at or college_email is distinct from lower(trim(new.email)));
  return new;
end $$;
