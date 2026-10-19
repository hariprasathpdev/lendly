create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  college_id uuid not null references public.colleges(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check(event_type in ('admin_access_denied','invalid_payment_signature')),
  source text not null check(source in ('admin_api','payment_checkout')),
  severity text not null check(severity in ('medium','high')),
  status text not null default 'open' check(status in ('open','under_review','resolved','dismissed')),
  occurrence_count integer not null default 1 check(occurrence_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  resolution text check(resolution is null or length(trim(resolution)) between 2 and 2000),
  event_key text not null unique,
  check((event_type='admin_access_denied' and source='admin_api') or (event_type='invalid_payment_signature' and source='payment_checkout')),
  check((status in ('open','under_review') and resolution is null) or status in ('resolved','dismissed'))
);

create index security_events_college_queue_idx
  on public.security_events(college_id,status,last_seen_at desc);
alter table public.security_events enable row level security;
revoke all on public.security_events from public,anon,authenticated;
grant all on public.security_events to service_role;

create or replace function public.record_security_event(
  p_actor_id uuid,
  p_event_type text,
  p_source text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  actor_college uuid;
  event_severity text;
  key_value text;
  event_id uuid;
begin
  if not ((p_event_type='admin_access_denied' and p_source='admin_api')
      or (p_event_type='invalid_payment_signature' and p_source='payment_checkout')) then
    raise exception 'INVALID_SECURITY_EVENT' using errcode='22023';
  end if;

  select college_id into actor_college from public.profiles
  where id=p_actor_id and email_verified_at is not null and terms_accepted_at is not null;
  if actor_college is null then return null; end if;

  event_severity='medium';
  -- Collapse repeated events from one actor into a single hourly review item.
  key_value=md5(actor_college::text||':'||p_actor_id::text||':'||p_event_type||':'||p_source||':'||date_trunc('hour',now())::text);
  insert into public.security_events as existing_event(college_id,actor_id,event_type,source,severity,event_key)
  values(actor_college,p_actor_id,p_event_type,p_source,event_severity,key_value)
  on conflict(event_key) do update set
    occurrence_count=least(existing_event.occurrence_count+1,2147483647),
    last_seen_at=now(),
    severity=case when existing_event.occurrence_count>=2 then 'high' else existing_event.severity end,
    status=case when existing_event.status in ('resolved','dismissed') then 'open' else existing_event.status end,
    reviewed_by=case when existing_event.status in ('resolved','dismissed') then null else existing_event.reviewed_by end,
    reviewed_at=case when existing_event.status in ('resolved','dismissed') then null else existing_event.reviewed_at end,
    resolution=case when existing_event.status in ('resolved','dismissed') then null else existing_event.resolution end
  returning id into event_id;
  return event_id;
end;
$$;

create or replace function public.review_security_event(
  p_security_event_id uuid,
  p_admin_id uuid,
  p_action text,
  p_resolution text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  event_row public.security_events%rowtype;
  admin_college uuid;
  next_status text;
begin
  select college_id into admin_college from public.profiles where id=p_admin_id and role='admin';
  if admin_college is null then raise exception 'ADMIN_ACCESS_REQUIRED' using errcode='42501'; end if;
  if p_action not in ('review','resolve','dismiss') then
    raise exception 'INVALID_SECURITY_EVENT_ACTION' using errcode='22023';
  end if;
  if p_action in ('resolve','dismiss') and length(trim(coalesce(p_resolution,''))) not between 2 and 2000 then
    raise exception 'SECURITY_EVENT_RESOLUTION_REQUIRED' using errcode='22023';
  end if;

  select * into event_row from public.security_events where id=p_security_event_id for update;
  if not found or event_row.college_id is distinct from admin_college then
    raise exception 'SECURITY_EVENT_NOT_FOUND' using errcode='P0002';
  end if;
  if event_row.status not in ('open','under_review') then
    raise exception 'SECURITY_EVENT_ALREADY_CLOSED' using errcode='P0001';
  end if;

  next_status=case p_action when 'review' then 'under_review' when 'resolve' then 'resolved' else 'dismissed' end;
  update public.security_events set status=next_status,
    reviewed_by=p_admin_id,reviewed_at=now(),
    resolution=case when p_action='review' then null else trim(p_resolution) end
  where id=event_row.id;
  insert into public.admin_audit_logs(admin_id,action,target_type,target_id,metadata)
  values(p_admin_id,'security_event.'||p_action,'security_event',event_row.id,
    jsonb_build_object('eventType',event_row.event_type,'occurrenceCount',event_row.occurrence_count,
      'resolution',nullif(trim(coalesce(p_resolution,'')),'')));
  return jsonb_build_object('id',event_row.id,'status',next_status);
end;
$$;

revoke all on function public.record_security_event(uuid,text,text) from public,anon,authenticated;
revoke all on function public.review_security_event(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_security_event(uuid,text,text) to service_role;
grant execute on function public.review_security_event(uuid,uuid,text,text) to service_role;
