create extension if not exists pgcrypto;
create type public.user_role as enum ('student','admin');
create type public.listing_status as enum ('pending_review','approved','rejected','paused','unavailable','archived');
create type public.item_condition as enum ('new','like_new','good','fair');

create table public.colleges (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.college_email_domains (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  domain text not null unique check (domain=lower(domain) and position('@' in domain)=0),
  created_at timestamptz not null default now()
);
insert into public.colleges(name) values ('Kongu Campus') on conflict(name) do nothing;
insert into public.college_email_domains(college_id,domain)
select id,'kongu.edu' from public.colleges where name='Kongu Campus' on conflict(domain) do nothing;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  college_id uuid not null references public.colleges(id),
  full_name text not null check (length(trim(full_name)) between 2 and 100),
  college_email text not null unique check (college_email=lower(college_email) and position('@' in college_email)>1),
  student_id text,
  role public.user_role not null default 'student',
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_college_idx on public.profiles(college_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);
insert into public.categories(name,slug) values
  ('Books & notes','books-notes'),('Electronics','electronics'),
  ('Lab equipment','lab-equipment'),('Sports & outdoors','sports-outdoors'),('Other','other')
on conflict(slug) do nothing;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  category_id uuid not null references public.categories(id),
  title text not null check (length(trim(title)) between 3 and 120),
  description text not null check (length(trim(description)) between 10 and 5000),
  item_condition public.item_condition not null,
  price_per_day numeric(10,2) not null default 0 check (price_per_day>=0),
  deposit_amount numeric(10,2) not null default 0 check (deposit_amount>=0),
  late_fee_per_day numeric(10,2) not null default 0 check (late_fee_per_day>=0),
  handover_location text not null check (length(trim(handover_location)) between 2 and 160),
  rules text check (rules is null or length(rules)<=2000),
  available_from date,
  available_until date,
  status public.listing_status not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_until is null or available_from is null or available_until>=available_from)
);
create index listings_public_search_idx on public.listings(status,created_at desc);
create index listings_owner_idx on public.listings(owner_id,created_at desc);
create index listings_category_idx on public.listings(category_id,status);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text not null unique,
  position smallint not null default 0 check(position between 0 and 9),
  created_at timestamptz not null default now()
);
create index listing_photos_listing_idx on public.listing_photos(listing_id,position);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end $$;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger listings_touch_updated_at before update on public.listings for each row execute function public.touch_updated_at();

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare matched_college uuid; user_domain text; display_name text;
begin
  if new.email is null or position('@' in new.email)<2 then raise exception 'A college email is required'; end if;
  user_domain=lower(split_part(new.email,'@',2));
  select d.college_id into matched_college from public.college_email_domains d join public.colleges c on c.id=d.college_id where d.domain=user_domain and c.active=true;
  if matched_college is null then raise exception 'This email domain is not approved'; end if;
  display_name=coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'New student');
  insert into public.profiles(id,college_id,full_name,college_email,email_verified_at)
  values(new.id,matched_college,display_name,lower(new.email),new.email_confirmed_at);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.sync_auth_email_verification() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update public.profiles set email_verified_at=new.email_confirmed_at, college_email=lower(new.email)
  where id=new.id and (email_verified_at is distinct from new.email_confirmed_at or college_email is distinct from lower(new.email));
  return new;
end $$;
create trigger on_auth_user_verified after update of email_confirmed_at,email on auth.users for each row execute function public.sync_auth_email_verification();

alter table public.colleges enable row level security;
alter table public.college_email_domains enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
create policy "Public can read active colleges" on public.colleges for select using(active=true);
create policy "Public can read categories" on public.categories for select using(true);
create policy "Public can read approved listings" on public.listings for select using(status='approved' or owner_id=auth.uid());
create policy "Public can read photos for visible listings" on public.listing_photos for select using(exists(select 1 from public.listings l where l.id=listing_id and (l.status='approved' or l.owner_id=auth.uid())));
create policy "Students read own profile" on public.profiles for select to authenticated using(id=auth.uid());
create policy "Students update own non-role fields" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
revoke all on public.profiles,public.college_email_domains from anon,authenticated;
grant select on public.profiles to authenticated;
grant update(full_name,student_id) on public.profiles to authenticated;
grant select on public.colleges,public.categories,public.listings,public.listing_photos to anon,authenticated;
