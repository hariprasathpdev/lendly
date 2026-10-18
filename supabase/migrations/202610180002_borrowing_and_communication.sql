create extension if not exists btree_gist;
create type public.booking_status as enum ('pending','accepted','declined','cancelled','awaiting_payment','confirmed','active','return_requested','completed','disputed');

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  borrower_id uuid not null references public.profiles(id),
  lender_id uuid not null references public.profiles(id),
  start_date date not null,
  end_date date not null,
  status public.booking_status not null default 'pending',
  daily_price numeric(10,2) not null check(daily_price>=0),
  deposit_amount numeric(10,2) not null check(deposit_amount>=0),
  late_fee_per_day numeric(10,2) not null check(late_fee_per_day>=0),
  total_price numeric(10,2) not null check(total_price>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(end_date>=start_date),
  check(borrower_id<>lender_id),
  exclude using gist (listing_id with =, daterange(start_date,end_date,'[]') with &&)
    where (status in ('accepted','awaiting_payment','confirmed','active','return_requested','disputed'))
);
create index bookings_borrower_idx on public.bookings(borrower_id,created_at desc);
create index bookings_lender_idx on public.bookings(lender_id,created_at desc);
create index bookings_listing_status_idx on public.bookings(listing_id,status,start_date,end_date);
create trigger bookings_touch_updated_at before update on public.bookings for each row execute function public.touch_updated_at();

create table public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  changed_by uuid references public.profiles(id),
  old_status public.booking_status,
  new_status public.booking_status not null,
  reason text,
  created_at timestamptz not null default now()
);
create index booking_history_idx on public.booking_status_history(booking_id,created_at);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  booking_id uuid references public.bookings(id),
  borrower_id uuid not null references public.profiles(id),
  lender_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check(borrower_id<>lender_id),
  unique(listing_id,borrower_id,lender_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check(length(trim(body)) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_conversation_created_idx on public.messages(conversation_id,created_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check(length(type) between 2 and 60),
  title text not null check(length(title) between 2 and 160),
  body text not null check(length(body)<=2000),
  related_type text,
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications(user_id,created_at desc) where read_at is null;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  listing_id uuid references public.listings(id),
  booking_id uuid references public.bookings(id),
  reason text not null check(length(reason) between 2 and 120),
  details text not null check(length(details) between 10 and 4000),
  status text not null default 'open' check(status in ('open','under_review','resolved','dismissed')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check(listing_id is not null or booking_id is not null)
);
create index reports_status_created_idx on public.reports(status,created_at desc);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  opened_by uuid not null references public.profiles(id),
  reason text not null,
  details text not null check(length(details) between 10 and 5000),
  status text not null default 'open' check(status in ('open','under_review','resolved','dismissed')),
  resolution text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index disputes_status_created_idx on public.disputes(status,created_at desc);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  reviewer_id uuid not null references public.profiles(id),
  reviewee_id uuid not null references public.profiles(id),
  rating smallint not null check(rating between 1 and 5),
  body text check(body is null or length(body)<=2000),
  created_at timestamptz not null default now(),
  check(reviewer_id<>reviewee_id),
  unique(booking_id,reviewer_id)
);

create or replace function public.guard_booking_transition() returns trigger language plpgsql as $$
declare allowed boolean := false;
begin
  if new.status is not distinct from old.status then return new; end if;
  allowed := case old.status
    when 'pending' then new.status in ('accepted','declined','cancelled','disputed')
    when 'accepted' then new.status in ('awaiting_payment','confirmed','cancelled','disputed')
    when 'awaiting_payment' then new.status in ('confirmed','cancelled','disputed')
    when 'confirmed' then new.status in ('active','cancelled','disputed')
    when 'active' then new.status in ('return_requested','disputed')
    when 'return_requested' then new.status in ('completed','disputed')
    when 'disputed' then new.status in ('cancelled','completed')
    else false end;
  if not allowed then raise exception 'Invalid booking status transition: % to %',old.status,new.status using errcode='23514'; end if;
  return new;
end $$;
create trigger booking_transition_guard before update of status on public.bookings for each row execute function public.guard_booking_transition();

alter table public.bookings enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.disputes enable row level security;
alter table public.reviews enable row level security;

