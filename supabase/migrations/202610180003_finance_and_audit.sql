create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  payer_id uuid not null references public.profiles(id),
  provider text not null default 'demo',
  provider_reference text,
  amount numeric(10,2) not null check(amount>=0),
  currency char(3) not null default 'INR',
  status text not null check(status in ('demo','created','authorized','captured','failed','refunded','voided')),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_booking_idx on public.payments(booking_id,created_at desc);
create trigger payments_touch_updated_at before update on public.payments for each row execute function public.touch_updated_at();

create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider,provider_event_id)
);
create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  amount numeric(10,2) not null check(amount>=0),
  status text not null check(status in ('not_collected','demo','pending','held','refund_requested','refunded','disputed')),
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger deposits_touch_updated_at before update on public.deposits for each row execute function public.touch_updated_at();

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  requested_by uuid not null references public.profiles(id),
  amount numeric(10,2) not null check(amount>0),
  status text not null check(status in ('requested','under_review','approved','rejected','issued','failed')),
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger refunds_touch_updated_at before update on public.refunds for each row execute function public.touch_updated_at();

create table public.late_fees (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  amount numeric(10,2) not null check(amount>=0),
  days_overdue integer not null check(days_overdue>=0),
  grace_days integer not null default 0 check(grace_days>=0),
  status text not null check(status in ('calculated','disputed','waived','paid_demo','collected')),
  reason text not null,
  created_at timestamptz not null default now()
);
create index late_fees_booking_idx on public.late_fees(booking_id,created_at desc);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_created_idx on public.admin_audit_logs(created_at desc);

alter table public.payments enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.deposits enable row level security;
alter table public.refunds enable row level security;
alter table public.late_fees enable row level security;
alter table public.admin_audit_logs enable row level security;
