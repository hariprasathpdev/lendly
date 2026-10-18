alter table public.reports
  add column if not exists resolution text;

alter table public.late_fees
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists resolution text;

alter table public.late_fees drop constraint if exists late_fees_status_check;
alter table public.late_fees add constraint late_fees_status_check
  check(status in ('calculated','disputed','confirmed','waived','paid_demo','collected'));

create unique index if not exists late_fees_booking_day_unique
  on public.late_fees(booking_id, days_overdue);

create table public.overdue_job_runs (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  run_date date not null,
  days_overdue integer not null check(days_overdue > 0),
  created_at timestamptz not null default now(),
  primary key(booking_id, run_date)
);
alter table public.overdue_job_runs enable row level security;

create or replace function public.mark_late_fees_disputed()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status='disputed' and old.status is distinct from new.status then
    update public.late_fees set status='disputed'
    where booking_id=new.id and status in ('calculated','confirmed');
  end if;
  return new;
end;
$$;
create trigger booking_dispute_marks_late_fees
after update of status on public.bookings
for each row execute function public.mark_late_fees_disputed();

create or replace function public.submit_report(
  p_reporter_id uuid,
  p_listing_id uuid,
  p_booking_id uuid,
  p_reason text,
  p_details text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  reporter_college uuid;
  target_college uuid;
  listing_owner uuid;
  report_id uuid;
begin
  if (p_listing_id is null)=(p_booking_id is null)
    or length(trim(coalesce(p_reason,''))) not between 2 and 120
    or length(trim(coalesce(p_details,''))) not between 10 and 4000 then
    raise exception 'INVALID_REPORT' using errcode='22023';
  end if;

  select college_id into reporter_college from public.profiles
  where id=p_reporter_id and email_verified_at is not null and terms_accepted_at is not null;
  if reporter_college is null then raise exception 'REPORTER_NOT_ELIGIBLE' using errcode='42501'; end if;

  if p_listing_id is not null then
    select l.owner_id,p.college_id into listing_owner,target_college
    from public.listings l join public.profiles p on p.id=l.owner_id
    where l.id=p_listing_id;
    if not found or target_college is distinct from reporter_college then
      raise exception 'REPORT_TARGET_NOT_FOUND' using errcode='P0002';
    end if;
    if listing_owner=p_reporter_id then raise exception 'CANNOT_REPORT_OWN_LISTING' using errcode='42501'; end if;
  else
    if not exists (
      select 1 from public.bookings b
      join public.profiles borrower on borrower.id=b.borrower_id
      join public.profiles lender on lender.id=b.lender_id
      where b.id=p_booking_id
        and p_reporter_id in (b.borrower_id,b.lender_id)
        and borrower.college_id=reporter_college and lender.college_id=reporter_college
    ) then raise exception 'REPORT_TARGET_NOT_FOUND' using errcode='P0002'; end if;
  end if;

  insert into public.reports(reporter_id,listing_id,booking_id,reason,details)
  values(p_reporter_id,p_listing_id,p_booking_id,trim(p_reason),trim(p_details))
  returning id into report_id;

  insert into public.notifications(user_id,type,title,body,related_type,related_id)
  select p.id,'report_received','A campus report needs review','A student submitted a report for campus support to review.','report',report_id
  from public.profiles p where p.role='admin' and p.college_id=reporter_college;

  return report_id;
end;
$$;

create or replace function public.review_report(
  p_report_id uuid,
  p_admin_id uuid,
  p_action text,
  p_resolution text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  report_row public.reports%rowtype;
  next_status text;
begin
  if not exists(select 1 from public.profiles where id=p_admin_id and role='admin') then
    raise exception 'ADMIN_ACCESS_REQUIRED' using errcode='42501';
  end if;
  if p_action not in ('review','resolve','dismiss') then
    raise exception 'INVALID_REPORT_ACTION' using errcode='22023';
  end if;
  if p_action in ('resolve','dismiss') and length(trim(coalesce(p_resolution,''))) not between 2 and 2000 then
    raise exception 'REPORT_RESOLUTION_REQUIRED' using errcode='22023';
  end if;

  select * into report_row from public.reports where id=p_report_id for update;
  if not found then raise exception 'REPORT_NOT_FOUND' using errcode='P0002'; end if;
  if report_row.status not in ('open','under_review') then raise exception 'REPORT_ALREADY_CLOSED' using errcode='P0001'; end if;

  next_status=case p_action when 'review' then 'under_review' when 'resolve' then 'resolved' else 'dismissed' end;
  update public.reports set status=next_status,
    resolution=case when p_action='review' then resolution else trim(p_resolution) end,
    reviewed_by=p_admin_id,reviewed_at=now()
  where id=report_row.id;
  insert into public.admin_audit_logs(admin_id,action,target_type,target_id,metadata)
  values(p_admin_id,'report.'||p_action,'report',report_row.id,
    jsonb_build_object('resolution',nullif(trim(coalesce(p_resolution,'')),''),'listingId',report_row.listing_id,'bookingId',report_row.booking_id));
  insert into public.notifications(user_id,type,title,body,related_type,related_id)
  values(report_row.reporter_id,'report_'||p_action,'Campus report updated',
    case p_action when 'review' then 'Campus support started reviewing your report.'
      when 'resolve' then 'Campus support completed its review of your report.'
      else 'Campus support closed your report after review.' end,
    'report',report_row.id);
  return jsonb_build_object('id',report_row.id,'status',next_status);
end;
$$;

create or replace function public.run_overdue_check(p_grace_days integer)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  booking_row public.bookings%rowtype;
  overdue_days integer;
  fee_day integer;
  claimed_booking uuid;
  processed_count integer := 0;
  fee_count integer := 0;
begin
  if p_grace_days is null or p_grace_days not between 0 and 30 then
    raise exception 'INVALID_GRACE_DAYS' using errcode='22023';
  end if;

  for booking_row in
    select * from public.bookings
    where status='active' and end_date < current_date-p_grace_days
    order by end_date
    for update skip locked
  loop
    overdue_days=current_date-booking_row.end_date-p_grace_days;
    insert into public.overdue_job_runs(booking_id,run_date,days_overdue)
    values(booking_row.id,current_date,overdue_days)
    on conflict(booking_id,run_date) do nothing
    returning booking_id into claimed_booking;
    if claimed_booking is null then continue; end if;
    claimed_booking=null;
    processed_count=processed_count+1;

    if booking_row.late_fee_per_day>0 then
      for fee_day in 1..overdue_days loop
        insert into public.late_fees(booking_id,amount,days_overdue,grace_days,status,reason)
        values(booking_row.id,booking_row.late_fee_per_day,fee_day,p_grace_days,'calculated',
          format('Day %s overdue after a %s-day grace period. This daily fee is calculated only and has not been collected.',fee_day,p_grace_days))
        on conflict(booking_id,days_overdue) do nothing;
        if found then fee_count=fee_count+1; end if;
      end loop;
    end if;

    insert into public.notifications(user_id,type,title,body,related_type,related_id)
    values
      (booking_row.borrower_id,'overdue_reminder','Borrowed item is overdue',
        format('The return date passed %s day(s) ago after the configured grace period. Contact the lender to arrange return.',overdue_days),'booking',booking_row.id),
      (booking_row.lender_id,'overdue_reminder','Borrowed item is overdue',
        format('A booking is %s day(s) past its return date after the configured grace period. Contact the borrower to arrange return.',overdue_days),'booking',booking_row.id);
  end loop;

  return jsonb_build_object('checkedDate',current_date,'remindersSent',processed_count,'dailyFeesRecorded',fee_count);
end;
$$;

create or replace function public.review_late_fee(
  p_late_fee_id uuid,
  p_admin_id uuid,
  p_action text,
  p_resolution text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  fee_row public.late_fees%rowtype;
  booking_row public.bookings%rowtype;
  next_status text;
begin
  if not exists(select 1 from public.profiles where id=p_admin_id and role='admin') then
    raise exception 'ADMIN_ACCESS_REQUIRED' using errcode='42501';
  end if;
  if p_action not in ('confirm','waive') or length(trim(coalesce(p_resolution,''))) not between 2 and 2000 then
    raise exception 'INVALID_LATE_FEE_REVIEW' using errcode='22023';
  end if;
  select * into fee_row from public.late_fees where id=p_late_fee_id for update;
  if not found then raise exception 'LATE_FEE_NOT_FOUND' using errcode='P0002'; end if;
  if fee_row.status not in ('calculated','disputed') then raise exception 'LATE_FEE_NOT_REVIEWABLE' using errcode='P0001'; end if;
  select * into booking_row from public.bookings where id=fee_row.booking_id;
  next_status=case p_action when 'waive' then 'waived' else 'confirmed' end;
  update public.late_fees set status=next_status,reviewed_by=p_admin_id,reviewed_at=now(),resolution=trim(p_resolution)
  where id=fee_row.id;
  insert into public.admin_audit_logs(admin_id,action,target_type,target_id,metadata)
  values(p_admin_id,'late_fee.'||p_action,'late_fee',fee_row.id,
    jsonb_build_object('bookingId',fee_row.booking_id,'amount',fee_row.amount,'daysOverdue',fee_row.days_overdue,'resolution',trim(p_resolution)));
  insert into public.notifications(user_id,type,title,body,related_type,related_id)
  values
    (booking_row.borrower_id,'late_fee_reviewed','Late fee reviewed',
      case p_action when 'waive' then 'Campus support waived a calculated late fee.' else 'Campus support reviewed a calculated late fee.' end,'booking',booking_row.id),
    (booking_row.lender_id,'late_fee_reviewed','Late fee reviewed',
      case p_action when 'waive' then 'Campus support waived a calculated late fee.' else 'Campus support reviewed a calculated late fee.' end,'booking',booking_row.id);
  return jsonb_build_object('id',fee_row.id,'status',next_status);
end;
$$;

revoke all on function public.submit_report(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.review_report(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.run_overdue_check(integer) from public,anon,authenticated;
revoke all on function public.review_late_fee(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.submit_report(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.review_report(uuid,uuid,text,text) to service_role;
grant execute on function public.run_overdue_check(integer) to service_role;
grant execute on function public.review_late_fee(uuid,uuid,text,text) to service_role;
