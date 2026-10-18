create or replace function public.create_booking_request(
  p_listing_id uuid,
  p_borrower_id uuid,
  p_start_date date,
  p_end_date date,
  p_college_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  listing_row public.listings%rowtype;
  borrower_college uuid;
  booking_id uuid;
  day_count integer;
begin
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date or p_start_date<current_date then
    raise exception 'INVALID_BOOKING_DATES' using errcode='22023';
  end if;

  select l.* into listing_row
  from public.listings l
  join public.profiles owner_profile on owner_profile.id=l.owner_id
  where l.id=p_listing_id and l.status='approved' and owner_profile.college_id=p_college_id
  for update of l;
  if not found then raise exception 'LISTING_UNAVAILABLE' using errcode='P0001'; end if;
  if listing_row.owner_id=p_borrower_id then raise exception 'SELF_BOOKING_NOT_ALLOWED' using errcode='42501'; end if;

  select college_id into borrower_college from public.profiles where id=p_borrower_id;
  if borrower_college is distinct from p_college_id then raise exception 'COLLEGE_MISMATCH' using errcode='42501'; end if;
  if listing_row.available_from is not null and p_start_date<listing_row.available_from then
    raise exception 'LISTING_UNAVAILABLE' using errcode='P0001';
  end if;
  if listing_row.available_until is not null and p_end_date>listing_row.available_until then
    raise exception 'LISTING_UNAVAILABLE' using errcode='P0001';
  end if;
  if exists (
    select 1 from public.bookings b
    where b.listing_id=p_listing_id
      and b.status in ('accepted','awaiting_payment','confirmed','active','return_requested','disputed')
      and b.start_date<=p_end_date and b.end_date>=p_start_date
  ) then raise exception 'BOOKING_CONFLICT' using errcode='23P01'; end if;

  day_count=(p_end_date-p_start_date)+1;
  insert into public.bookings(
    listing_id,borrower_id,lender_id,start_date,end_date,status,
    daily_price,deposit_amount,late_fee_per_day,total_price
  ) values (
    listing_row.id,p_borrower_id,listing_row.owner_id,p_start_date,p_end_date,'pending',
    listing_row.price_per_day,listing_row.deposit_amount,listing_row.late_fee_per_day,
    listing_row.price_per_day*day_count
  ) returning id into booking_id;

  insert into public.booking_status_history(booking_id,changed_by,old_status,new_status,reason)
  values (booking_id,p_borrower_id,null,'pending','Booking request submitted.');
  insert into public.notifications(user_id,type,title,body,related_type,related_id)
  values (listing_row.owner_id,'booking_request','New borrowing request','A student requested your item for the selected dates.','booking',booking_id);
  insert into public.conversations(listing_id,booking_id,borrower_id,lender_id)
  values (listing_row.id,booking_id,p_borrower_id,listing_row.owner_id)
  on conflict (listing_id,borrower_id,lender_id) do nothing;
  return booking_id;
end;
$$;

create or replace function public.transition_booking(
  p_booking_id uuid,
  p_actor_id uuid,
  p_action text,
  p_reason text default null,
  p_details text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  booking_row public.bookings%rowtype;
  next_status public.booking_status;
  recipient_id uuid;
  notice_title text;
  notice_body text;
begin
  select * into booking_row from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND' using errcode='P0002'; end if;
  if p_actor_id not in (booking_row.borrower_id,booking_row.lender_id) then
    raise exception 'BOOKING_ACCESS_DENIED' using errcode='42501';
  end if;

  if p_action in ('accept','decline') then
    if p_actor_id<>booking_row.lender_id then raise exception 'LENDER_ACTION_REQUIRED' using errcode='42501'; end if;
    if booking_row.status<>'pending' then raise exception 'BOOKING_STATE_CHANGED' using errcode='P0001'; end if;
    next_status=case p_action when 'accept' then 'accepted'::public.booking_status else 'declined'::public.booking_status end;
  elsif p_action='confirm' then
    if p_actor_id<>booking_row.borrower_id then raise exception 'BORROWER_ACTION_REQUIRED' using errcode='42501'; end if;
    if booking_row.status<>'accepted' then raise exception 'BOOKING_STATE_CHANGED' using errcode='P0001'; end if;
    next_status='confirmed';
  elsif p_action='cancel' then
    if p_actor_id<>booking_row.borrower_id then raise exception 'BORROWER_ACTION_REQUIRED' using errcode='42501'; end if;
    if booking_row.status not in ('pending','accepted','confirmed') then raise exception 'BOOKING_STATE_CHANGED' using errcode='P0001'; end if;
    if exists(select 1 from public.payments where booking_id=booking_row.id and status in ('captured','refunded')) then
      raise exception 'PAYMENT_REFUND_REVIEW_REQUIRED' using errcode='P0001';
    end if;
    next_status='cancelled';
  elsif p_action='handover' then
    if p_actor_id<>booking_row.lender_id then raise exception 'LENDER_ACTION_REQUIRED' using errcode='42501'; end if;
    if booking_row.status<>'confirmed' then raise exception 'BOOKING_STATE_CHANGED' using errcode='P0001'; end if;
    next_status='active';
  elsif p_action='return' then
    if p_actor_id<>booking_row.borrower_id then raise exception 'BORROWER_ACTION_REQUIRED' using errcode='42501'; end if;
    if booking_row.status<>'active' then raise exception 'BOOKING_STATE_CHANGED' using errcode='P0001'; end if;
    next_status='return_requested';
  elsif p_action='complete' then
    if p_actor_id<>booking_row.lender_id then raise exception 'LENDER_ACTION_REQUIRED' using errcode='42501'; end if;
    if booking_row.status<>'return_requested' then raise exception 'BOOKING_STATE_CHANGED' using errcode='P0001'; end if;
    next_status='completed';
  elsif p_action='dispute' then
    if booking_row.status not in ('pending','accepted','confirmed','active','return_requested') then
      raise exception 'BOOKING_STATE_CHANGED' using errcode='P0001';
    end if;
    if length(trim(coalesce(p_reason,''))) not between 2 and 120 or length(trim(coalesce(p_details,''))) not between 10 and 5000 then
      raise exception 'DISPUTE_DETAILS_REQUIRED' using errcode='22023';
    end if;
    next_status='disputed';
    insert into public.disputes(booking_id,opened_by,reason,details)
    values (booking_row.id,p_actor_id,trim(p_reason),trim(p_details));
  else
    raise exception 'INVALID_BOOKING_ACTION' using errcode='22023';
  end if;

  update public.bookings set status=next_status where id=booking_row.id;
  insert into public.booking_status_history(booking_id,changed_by,old_status,new_status,reason)
  values (booking_row.id,p_actor_id,booking_row.status,next_status,case when p_action='dispute' then trim(p_reason) else p_action end);

  recipient_id=case when p_actor_id=booking_row.borrower_id then booking_row.lender_id else booking_row.borrower_id end;
  notice_title=case p_action
    when 'accept' then 'Request accepted'
    when 'decline' then 'Request declined'
    when 'confirm' then 'Borrowing confirmed'
    when 'cancel' then 'Booking cancelled'
    when 'handover' then 'Item handed over'
    when 'return' then 'Return requested'
    when 'complete' then 'Return confirmed'
    else 'Booking issue reported' end;
  notice_body=case p_action
    when 'accept' then 'The lender accepted the request. Review the dates and confirm to continue.'
    when 'decline' then 'The lender declined the borrowing request.'
    when 'confirm' then 'The borrower confirmed the request. Coordinate the campus handover.'
    when 'cancel' then 'The borrower cancelled the booking.'
    when 'handover' then 'The lender marked the item as handed over.'
    when 'return' then 'The borrower says the item is ready to return.'
    when 'complete' then 'The lender confirmed the item was returned.'
    else 'A participant reported an issue. Review the booking and contact campus support.' end;
  insert into public.notifications(user_id,type,title,body,related_type,related_id)
  values (recipient_id,'booking_'||p_action,notice_title,notice_body,'booking',booking_row.id);

  return jsonb_build_object('id',booking_row.id,'status',next_status);
end;
$$;

create or replace function public.send_conversation_message(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_body text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  conversation_row public.conversations%rowtype;
  message_id uuid;
  recipient_id uuid;
begin
  if length(trim(coalesce(p_body,''))) not between 1 and 4000 then
    raise exception 'INVALID_MESSAGE_BODY' using errcode='22023';
  end if;
  select * into conversation_row from public.conversations where id=p_conversation_id;
  if not found then raise exception 'CONVERSATION_NOT_FOUND' using errcode='P0002'; end if;
  if p_sender_id not in (conversation_row.borrower_id,conversation_row.lender_id) then
    raise exception 'CONVERSATION_ACCESS_DENIED' using errcode='42501';
  end if;
  recipient_id=case when p_sender_id=conversation_row.borrower_id then conversation_row.lender_id else conversation_row.borrower_id end;
  insert into public.messages(conversation_id,sender_id,body)
  values (conversation_row.id,p_sender_id,trim(p_body)) returning id into message_id;
  insert into public.notifications(user_id,type,title,body,related_type,related_id)
  values (recipient_id,'message_received','New campus message','You received a message about a campus borrowing request.','conversation',conversation_row.id);
  return message_id;
end;
$$;

create or replace function public.moderate_listing(
  p_listing_id uuid,
  p_admin_id uuid,
  p_action text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  listing_row public.listings%rowtype;
  next_status public.listing_status;
  notification_title text;
  notification_body text;
begin
  if p_action not in ('approve','reject') then raise exception 'INVALID_MODERATION_ACTION' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=p_admin_id and role='admin') then
    raise exception 'ADMIN_ACCESS_REQUIRED' using errcode='42501';
  end if;
  if p_action='reject' and length(trim(coalesce(p_reason,''))) not between 2 and 1000 then
    raise exception 'REJECTION_REASON_REQUIRED' using errcode='22023';
  end if;

  select * into listing_row from public.listings where id=p_listing_id for update;
  if not found then raise exception 'LISTING_NOT_FOUND' using errcode='P0002'; end if;
  if listing_row.status not in ('pending_review','rejected') then
    raise exception 'LISTING_NOT_REVIEWABLE' using errcode='P0001';
  end if;

  next_status=case p_action when 'approve' then 'approved'::public.listing_status else 'rejected'::public.listing_status end;
  update public.listings set status=next_status where id=listing_row.id;
  insert into public.admin_audit_logs(admin_id,action,target_type,target_id,metadata)
  values (p_admin_id,'listing.'||p_action,'listing',listing_row.id,jsonb_build_object('reason',nullif(trim(coalesce(p_reason,'')),'')));
  notification_title=case p_action when 'approve' then 'Listing approved' else 'Listing needs changes' end;
  notification_body=case p_action when 'approve' then 'Your listing is approved and available to campus students.' else 'Your listing was not approved: '||trim(p_reason) end;
  insert into public.notifications(user_id,type,title,body,related_type,related_id)
  values (listing_row.owner_id,'listing_'||p_action,notification_title,notification_body,'listing',listing_row.id);
  return jsonb_build_object('id',listing_row.id,'status',next_status);
end;
$$;

create or replace function public.guard_booking_transition() returns trigger
language plpgsql
as $$
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
    when 'disputed' then new.status in ('pending','accepted','confirmed','active','return_requested','cancelled','completed')
    else false end;
  if not allowed then raise exception 'Invalid booking status transition: % to %',old.status,new.status using errcode='23514'; end if;
  return new;
end;
$$;

create or replace function public.resolve_dispute(
  p_dispute_id uuid,
  p_admin_id uuid,
  p_action text,
  p_resolution text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  dispute_row public.disputes%rowtype;
  booking_row public.bookings%rowtype;
  next_status public.booking_status;
  resolved_status text;
begin
  if not exists(select 1 from public.profiles where id=p_admin_id and role='admin') then
    raise exception 'ADMIN_ACCESS_REQUIRED' using errcode='42501';
  end if;
  if p_action not in ('cancel','complete','dismiss') or length(trim(coalesce(p_resolution,''))) not between 2 and 2000 then
    raise exception 'INVALID_DISPUTE_RESOLUTION' using errcode='22023';
  end if;

  select * into dispute_row from public.disputes where id=p_dispute_id for update;
  if not found then raise exception 'DISPUTE_NOT_FOUND' using errcode='P0002'; end if;
  if dispute_row.status not in ('open','under_review') then raise exception 'DISPUTE_ALREADY_CLOSED' using errcode='P0001'; end if;
  select * into booking_row from public.bookings where id=dispute_row.booking_id for update;
  if not found or booking_row.status<>'disputed' then raise exception 'BOOKING_NOT_DISPUTED' using errcode='P0001'; end if;

  if p_action='cancel' then
    next_status='cancelled'; resolved_status='resolved';
  elsif p_action='complete' then
    next_status='completed'; resolved_status='resolved';
  else
    select old_status into next_status from public.booking_status_history
    where booking_id=booking_row.id and new_status='disputed' and old_status is not null
    order by created_at desc limit 1;
    if next_status is null then raise exception 'DISPUTE_PRIOR_STATE_MISSING' using errcode='P0001'; end if;
    resolved_status='dismissed';
  end if;

  update public.bookings set status=next_status where id=booking_row.id;
  update public.disputes set status=resolved_status,resolution=trim(p_resolution),reviewed_by=p_admin_id,reviewed_at=now()
  where id=dispute_row.id;
  insert into public.booking_status_history(booking_id,changed_by,old_status,new_status,reason)
  values (booking_row.id,p_admin_id,booking_row.status,next_status,trim(p_resolution));
  insert into public.admin_audit_logs(admin_id,action,target_type,target_id,metadata)
  values (p_admin_id,'dispute.'||p_action,'dispute',dispute_row.id,jsonb_build_object('bookingId',booking_row.id,'resolution',trim(p_resolution)));
  insert into public.notifications(user_id,type,title,body,related_type,related_id)
  values
    (booking_row.borrower_id,'dispute_resolved','Dispute reviewed','Campus support reviewed the booking issue. Check the booking activity for its updated status.','booking',booking_row.id),
    (booking_row.lender_id,'dispute_resolved','Dispute reviewed','Campus support reviewed the booking issue. Check the booking activity for its updated status.','booking',booking_row.id);
  return jsonb_build_object('id',booking_row.id,'status',next_status,'disputeStatus',resolved_status);
end;
$$;

alter table public.payments add column if not exists provider_payment_id text;
create unique index if not exists payments_provider_reference_unique
  on public.payments(provider_reference) where provider_reference is not null;
create unique index if not exists payments_provider_payment_id_unique
  on public.payments(provider_payment_id) where provider_payment_id is not null;
create unique index if not exists deposits_booking_unique on public.deposits(booking_id);
create unique index if not exists refunds_provider_reference_unique
  on public.refunds(provider_reference) where provider_reference is not null;
create unique index if not exists refunds_active_payment_unique
  on public.refunds(payment_id) where status in ('requested','under_review','approved','issued');

create or replace function public.reserve_razorpay_payment(p_booking_id uuid,p_payer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  booking_row public.bookings%rowtype;
  payment_row public.payments%rowtype;
  payment_amount numeric(10,2);
begin
  select * into booking_row from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND' using errcode='P0002'; end if;
  if booking_row.borrower_id<>p_payer_id then raise exception 'BORROWER_ACTION_REQUIRED' using errcode='42501'; end if;
  if booking_row.status not in ('accepted','awaiting_payment') then raise exception 'BOOKING_STATE_CHANGED' using errcode='P0001'; end if;
  payment_amount=booking_row.total_price+booking_row.deposit_amount;
  if payment_amount<=0 then raise exception 'PAYMENT_NOT_REQUIRED' using errcode='22023'; end if;
  if payment_amount<1 then raise exception 'PAYMENT_BELOW_PROVIDER_MINIMUM' using errcode='22023'; end if;

  if booking_row.status='accepted' then
    update public.bookings set status='awaiting_payment' where id=booking_row.id;
    insert into public.booking_status_history(booking_id,changed_by,old_status,new_status,reason)
    values (booking_row.id,p_payer_id,'accepted','awaiting_payment','Test payment order created.');
  end if;

  insert into public.payments(booking_id,payer_id,provider,amount,currency,status,idempotency_key)
  values (booking_row.id,p_payer_id,'razorpay_test',payment_amount,'INR','created','booking:'||booking_row.id||':razorpay_test')
  on conflict(idempotency_key) do nothing;
  select * into payment_row from public.payments where idempotency_key='booking:'||booking_row.id||':razorpay_test' for update;
  if payment_row.status='failed' then
    update public.payments set status='created',provider_payment_id=null where id=payment_row.id returning * into payment_row;
  end if;
  if booking_row.deposit_amount>0 then
    insert into public.deposits(booking_id,amount,status)
    values (booking_row.id,booking_row.deposit_amount,'pending')
    on conflict(booking_id) do update
      set amount=excluded.amount,status='pending'
      where public.deposits.status in ('not_collected','pending');
  end if;
  return jsonb_build_object('paymentId',payment_row.id,'amount',payment_row.amount,'providerReference',payment_row.provider_reference,'status',payment_row.status);
end;
$$;

create or replace function public.complete_demo_payment(p_booking_id uuid,p_payer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  booking_row public.bookings%rowtype;
  payment_row public.payments%rowtype;
  payment_amount numeric(10,2);
begin
  select * into booking_row from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND' using errcode='P0002'; end if;
  if booking_row.borrower_id<>p_payer_id then raise exception 'BORROWER_ACTION_REQUIRED' using errcode='42501'; end if;
  if booking_row.status not in ('accepted','confirmed') then raise exception 'BOOKING_STATE_CHANGED' using errcode='P0001'; end if;
  payment_amount=booking_row.total_price+booking_row.deposit_amount;
  insert into public.payments(booking_id,payer_id,provider,amount,currency,status,idempotency_key,provider_reference)
  values (booking_row.id,p_payer_id,'demo',payment_amount,'INR','demo','booking:'||booking_row.id||':demo','demo_'||replace(booking_row.id::text,'-',''))
  on conflict(idempotency_key) do nothing;
  select * into payment_row from public.payments where idempotency_key='booking:'||booking_row.id||':demo';
  if booking_row.deposit_amount>0 then
    insert into public.deposits(booking_id,amount,status)
    values (booking_row.id,booking_row.deposit_amount,'demo')
    on conflict(booking_id) do update set status='demo';
  end if;
  if booking_row.status='accepted' then
    update public.bookings set status='confirmed' where id=booking_row.id;
    insert into public.booking_status_history(booking_id,changed_by,old_status,new_status,reason)
    values (booking_row.id,p_payer_id,'accepted','confirmed','Demo payment recorded; no money was collected.');
    insert into public.notifications(user_id,type,title,body,related_type,related_id)
    values (booking_row.lender_id,'booking_confirmed','Booking confirmed','The borrower confirmed in demo mode. No money was collected. Coordinate the handover.','booking',booking_row.id);
  end if;
  return jsonb_build_object('paymentId',payment_row.id,'bookingId',booking_row.id,
    'status',case when booking_row.status='accepted' then 'confirmed' else booking_row.status end,'paymentStatus','demo');
end;
$$;

create or replace function public.record_razorpay_payment_event(
  p_event_id text,
  p_event_type text,
  p_order_id text,
  p_payment_id text,
  p_payment_status text,
  p_amount bigint,
  p_currency text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  webhook_id uuid;
  payment_row public.payments%rowtype;
  booking_row public.bookings%rowtype;
begin
  insert into public.payment_webhook_events(provider,provider_event_id,event_type)
  values ('razorpay_test',p_event_id,p_event_type)
  on conflict(provider,provider_event_id) do nothing
  returning id into webhook_id;
  if webhook_id is null then return jsonb_build_object('duplicate',true); end if;

  select * into payment_row from public.payments
  where provider='razorpay_test' and provider_reference=p_order_id for update;
  if not found then raise exception 'PAYMENT_ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if p_currency<>'INR' or p_amount<>round(payment_row.amount*100)::bigint then
    raise exception 'PAYMENT_AMOUNT_MISMATCH' using errcode='22023';
  end if;
  if p_payment_status not in ('authorized','captured','failed') then
    raise exception 'INVALID_PROVIDER_PAYMENT_STATUS' using errcode='22023';
  end if;

  if payment_row.status not in ('captured','refunded') then
    update public.payments set status=p_payment_status,provider_payment_id=p_payment_id
    where id=payment_row.id;
    if p_payment_status='captured' then
      select * into booking_row from public.bookings where id=payment_row.booking_id for update;
      if booking_row.status='awaiting_payment' then
        update public.bookings set status='confirmed' where id=booking_row.id;
        insert into public.booking_status_history(booking_id,changed_by,old_status,new_status,reason)
        values (booking_row.id,payment_row.payer_id,'awaiting_payment','confirmed','Razorpay test payment captured.');
        insert into public.notifications(user_id,type,title,body,related_type,related_id)
        values
          (booking_row.borrower_id,'payment_captured','Test payment confirmed','Your test payment was verified. No live transaction was made.','booking',booking_row.id),
          (booking_row.lender_id,'payment_captured','Booking confirmed','The borrower completed the test checkout. No live transaction was made.','booking',booking_row.id);
      end if;
    end if;
  end if;
  update public.payment_webhook_events set processed_at=now() where id=webhook_id;
  return jsonb_build_object('duplicate',false,'paymentStatus',p_payment_status,'bookingId',payment_row.booking_id);
end;
$$;

create or replace function public.request_deposit_refund(p_booking_id uuid,p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  booking_row public.bookings%rowtype;
  payment_row public.payments%rowtype;
  deposit_row public.deposits%rowtype;
  refund_row public.refunds%rowtype;
begin
  select * into booking_row from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND' using errcode='P0002'; end if;
  if booking_row.borrower_id<>p_user_id then raise exception 'BORROWER_ACTION_REQUIRED' using errcode='42501'; end if;
  if booking_row.status<>'completed' then raise exception 'REFUND_NOT_ELIGIBLE' using errcode='P0001'; end if;

  select * into payment_row from public.payments
  where booking_id=booking_row.id and provider='razorpay_test' and status='captured'
  order by created_at desc limit 1 for update;
  if not found then raise exception 'REFUND_NOT_ELIGIBLE' using errcode='P0001'; end if;
  select * into deposit_row from public.deposits where booking_id=booking_row.id for update;
  if not found or deposit_row.amount<=0 or deposit_row.status not in ('pending','held','refund_requested') then
    raise exception 'REFUND_NOT_ELIGIBLE' using errcode='P0001';
  end if;

  select * into refund_row from public.refunds
  where payment_id=payment_row.id and status in ('requested','under_review','approved','issued','failed')
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('id',refund_row.id,'amount',refund_row.amount,'status',refund_row.status);
  end if;

  insert into public.refunds(payment_id,requested_by,amount,status)
  values (payment_row.id,p_user_id,deposit_row.amount,'requested')
  returning * into refund_row;
  update public.deposits set status='refund_requested' where id=deposit_row.id;
  insert into public.notifications(user_id,type,title,body,related_type,related_id)
  values (booking_row.lender_id,'deposit_refund_requested','Deposit refund requested','The borrower requested the return of the refundable deposit. Campus support will review it.','booking',booking_row.id);
  return jsonb_build_object('id',refund_row.id,'amount',refund_row.amount,'status',refund_row.status);
end;
$$;

create or replace function public.review_test_refund(
  p_refund_id uuid,
  p_admin_id uuid,
  p_action text,
  p_provider_reference text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  refund_row public.refunds%rowtype;
  payment_row public.payments%rowtype;
  v_booking_id uuid;
  next_status text;
begin
  if not exists(select 1 from public.profiles where id=p_admin_id and role='admin') then
    raise exception 'ADMIN_ACCESS_REQUIRED' using errcode='42501';
  end if;
  if p_action not in ('approve','reject','issued','failed') then
    raise exception 'INVALID_REFUND_ACTION' using errcode='22023';
  end if;
  if p_action='issued' and (p_provider_reference is null or p_provider_reference !~ '^rfnd_[A-Za-z0-9]+$') then
    raise exception 'REFUND_PROVIDER_REFERENCE_REQUIRED' using errcode='22023';
  end if;
  if p_action<>'issued' and p_provider_reference is not null then
    raise exception 'INVALID_REFUND_PROVIDER_REFERENCE' using errcode='22023';
  end if;

  select * into refund_row from public.refunds where id=p_refund_id for update;
  if not found then raise exception 'REFUND_NOT_FOUND' using errcode='P0002'; end if;
  select * into payment_row from public.payments where id=refund_row.payment_id for update;
  if not found or payment_row.provider<>'razorpay_test' then raise exception 'REFUND_NOT_ELIGIBLE' using errcode='P0001'; end if;
  v_booking_id=payment_row.booking_id;

  if p_action='approve' then
    if refund_row.status not in ('requested','failed') then raise exception 'REFUND_STATE_CHANGED' using errcode='P0001'; end if;
    next_status='approved';
  elsif p_action='reject' then
    if refund_row.status not in ('requested','under_review','failed') then raise exception 'REFUND_STATE_CHANGED' using errcode='P0001'; end if;
    next_status='rejected';
  elsif p_action='issued' then
    if refund_row.status<>'approved' then raise exception 'REFUND_STATE_CHANGED' using errcode='P0001'; end if;
    next_status='issued';
  else
    if refund_row.status<>'approved' then raise exception 'REFUND_STATE_CHANGED' using errcode='P0001'; end if;
    next_status='failed';
  end if;

  update public.refunds set status=next_status,provider_reference=case when p_action='issued' then p_provider_reference else provider_reference end
  where id=refund_row.id;
  if p_action='issued' then
    update public.deposits set status='refunded' where booking_id=v_booking_id;
    if refund_row.amount>=payment_row.amount then update public.payments set status='refunded' where id=payment_row.id; end if;
  elsif p_action='reject' then
    update public.deposits set status='pending' where booking_id=v_booking_id and status='refund_requested';
  end if;
  insert into public.admin_audit_logs(admin_id,action,target_type,target_id,metadata)
  values (p_admin_id,'refund.'||p_action,'refund',refund_row.id,jsonb_build_object('bookingId',v_booking_id,'amount',refund_row.amount,'providerReference',case when p_action='issued' then p_provider_reference else null end));
  insert into public.notifications(user_id,type,title,body,related_type,related_id)
  values (refund_row.requested_by,'deposit_refund_'||next_status,'Deposit refund update',
    case p_action when 'approve' then 'Your deposit refund request was approved. Issue the refund in the Razorpay test dashboard, then record its reference.'
      when 'reject' then 'Your deposit refund request was declined. Contact campus support if you need a review.'
      when 'issued' then 'The provider refund was issued and its reference was recorded.'
      else 'The provider refund failed. Campus support will review the provider status.' end,
    'booking',v_booking_id);
  return jsonb_build_object('id',refund_row.id,'status',next_status,'bookingId',v_booking_id,'providerReference',case when p_action='issued' then p_provider_reference else refund_row.provider_reference end);
end;
$$;

revoke all on function public.create_booking_request(uuid,uuid,date,date,uuid) from public,anon,authenticated;
revoke all on function public.transition_booking(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.send_conversation_message(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.moderate_listing(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.resolve_dispute(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.reserve_razorpay_payment(uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_demo_payment(uuid,uuid) from public,anon,authenticated;
revoke all on function public.record_razorpay_payment_event(text,text,text,text,text,bigint,text) from public,anon,authenticated;
revoke all on function public.request_deposit_refund(uuid,uuid) from public,anon,authenticated;
revoke all on function public.review_test_refund(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_booking_request(uuid,uuid,date,date,uuid) to service_role;
grant execute on function public.transition_booking(uuid,uuid,text,text,text) to service_role;
grant execute on function public.send_conversation_message(uuid,uuid,text) to service_role;
grant execute on function public.moderate_listing(uuid,uuid,text,text) to service_role;
grant execute on function public.resolve_dispute(uuid,uuid,text,text) to service_role;
grant execute on function public.reserve_razorpay_payment(uuid,uuid) to service_role;
grant execute on function public.complete_demo_payment(uuid,uuid) to service_role;
grant execute on function public.record_razorpay_payment_event(text,text,text,text,text,bigint,text) to service_role;
grant execute on function public.request_deposit_refund(uuid,uuid) to service_role;
grant execute on function public.review_test_refund(uuid,uuid,text,text) to service_role;
