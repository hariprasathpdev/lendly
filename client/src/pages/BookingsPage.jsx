import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api.js';
import { useAuth } from '../features/auth/AuthContext.jsx';

const statusLabels = {
  pending: 'Waiting for lender', accepted: 'Accepted · awaiting confirmation', declined: 'Declined',
  cancelled: 'Cancelled', awaiting_payment: 'Awaiting payment', confirmed: 'Ready for handover',
  active: 'Borrowing in progress', return_requested: 'Return requested', completed: 'Completed', disputed: 'Under dispute',
};
const actionLabels = {
  accept: 'Accept request', decline: 'Decline', confirm: 'Confirm request', pay: 'Review payment and confirm', refund: 'Request deposit refund', cancel: 'Cancel booking',
  handover: 'Mark handed over', return: 'Request return', complete: 'Confirm return', dispute: 'Report an issue',
};
const actionConfirmations = {
  accept: 'Accept this borrowing request?',
  decline: 'Decline this borrowing request?',
  confirm: 'Confirm the booking? No payment will be collected.',
  cancel: 'Cancel this booking?',
  handover: 'Mark the item as handed over to the borrower?',
  return: 'Tell the lender that the item is ready to return?',
  complete: 'Confirm that the item was returned?',
};
const razorpayScriptUrl = 'https://checkout.razorpay.com/v1/checkout.js';
let razorpayLoadPromise;

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayLoadPromise) return razorpayLoadPromise;
  razorpayLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${razorpayScriptUrl}"]`);
    const script = document.createElement('script');
    const target = existing ?? script;
    target.addEventListener('load', () => {
      if (window.Razorpay) resolve();
      else reject(new Error('Razorpay checkout did not initialize. Check the test-mode setup and try again.'));
    }, { once: true });
    target.addEventListener('error', () => reject(new Error('Razorpay checkout could not be loaded. Try again.')), { once: true });
    if (!existing) {
      target.src = razorpayScriptUrl;
      target.async = true;
      document.head.appendChild(target);
    }
  }).catch((error) => {
    razorpayLoadPromise = null;
    throw error;
  });
  return razorpayLoadPromise;
}
const money = (value) => value === 0 ? 'Free' : `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dateLabel = (value) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  .format(new Date(`${value}T00:00:00`));

function actionsFor(booking, paymentMode) {
  const actions = [];
  if (booking.side === 'lender' && booking.status === 'pending') actions.push('accept', 'decline');
  if (booking.side === 'borrower' && booking.status === 'pending') actions.push('cancel');
  if (booking.side === 'borrower' && booking.status === 'accepted') {
    if (paymentMode === 'disabled') actions.push('confirm');
    else if (paymentMode === 'demo' || paymentMode === 'razorpay_test') actions.push('pay');
    actions.push('cancel');
  }
  if (booking.side === 'borrower' && booking.status === 'awaiting_payment'
      && (paymentMode === 'demo' || paymentMode === 'razorpay_test')) actions.push('pay');
  if (booking.side === 'lender' && booking.status === 'confirmed') actions.push('handover');
  if (booking.side === 'borrower' && booking.status === 'confirmed'
      && !booking.payments?.some((payment) => ['captured', 'refunded'].includes(payment.status))) actions.push('cancel');
  if (booking.side === 'borrower' && booking.status === 'active') actions.push('return');
  if (booking.side === 'lender' && booking.status === 'return_requested') actions.push('complete');
  if (booking.side === 'borrower' && booking.status === 'completed' && paymentMode === 'razorpay_test'
      && ['pending', 'held'].includes(booking.depositStatus)
      && booking.payments?.some((payment) => payment.provider === 'razorpay_test' && payment.status === 'captured')) actions.push('refund');
  if (['pending', 'accepted', 'confirmed', 'active', 'return_requested'].includes(booking.status)) actions.push('dispute');
  return actions;
}

export default function BookingsPage() {
  const { user } = useAuth();
  const [refreshCount, setRefreshCount] = useState(0);
  const [roleFilter, setRoleFilter] = useState('all');
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [disputeId, setDisputeId] = useState(null);
  const [paymentPolicy, setPaymentPolicy] = useState(null);
  const [result, setResult] = useState({ key: null, bookings: [], error: null });
  const requestKey = String(refreshCount);

  useEffect(() => {
    let active = true;
    apiRequest('/bookings/mine')
      .then(({ bookings }) => {
        if (active) setResult({ key: requestKey, bookings, error: null });
      })
      .catch((error) => {
        if (active) setResult({ key: requestKey, bookings: [], error });
      });
    return () => { active = false; };
  }, [requestKey]);

  useEffect(() => {
    let active = true;
    apiRequest('/payments/policy')
      .then((policy) => { if (active) setPaymentPolicy(policy); })
      .catch((error) => { if (active) setPaymentPolicy({ error }); });
    return () => { active = false; };
  }, []);

  const loading = result.key !== requestKey;
  const bookings = result.bookings.filter((booking) => roleFilter === 'all' || booking.side === roleFilter);

  async function performAction(booking, action, dispute = null) {
    if (action !== 'dispute' && !window.confirm(actionConfirmations[action])) return;
    setBusyId(booking.id);
    setNotice(null);
    try {
      await apiRequest(`/bookings/${booking.id}/action`, {
        method: 'PATCH',
        body: { action, ...(dispute ?? {}) },
      });
      setNotice({ kind: 'success', text: `Booking updated: ${actionLabels[action].toLowerCase()}.` });
      setDisputeId(null);
      setRefreshCount((count) => count + 1);
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setBusyId(null);
    }
  }

  async function startPayment(booking) {
    const amount = booking.totalPrice + booking.depositAmount;
    const isDemo = paymentPolicy?.mode === 'demo';
    const prompt = isDemo
      ? `Confirm this booking in demo mode? The displayed total is ${money(amount)}, but no money will be collected.`
      : `Continue to Razorpay test checkout for ${money(amount)} (borrowing ${money(booking.totalPrice)} + refundable deposit ${money(booking.depositAmount)})? Test mode does not collect live money.`;
    if (!window.confirm(prompt)) return;

    setBusyId(booking.id);
    setNotice(null);
    try {
      const order = await apiRequest('/payments/orders', {
        method: 'POST',
        body: { bookingId: booking.id },
      });
      if (order.mode === 'demo') {
        setNotice({ kind: 'success', text: 'Demo confirmation recorded. No money was collected or refunded.' });
        setRefreshCount((count) => count + 1);
        setBusyId(null);
        return;
      }
      if (order.paymentRequired === false) {
        setNotice({ kind: 'success', text: 'The free booking was confirmed. No payment was required.' });
        setRefreshCount((count) => count + 1);
        setBusyId(null);
        return;
      }

      await loadRazorpayCheckout();
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Lendly Campus',
        description: order.description,
        order_id: order.orderId,
        prefill: { name: user?.user_metadata?.full_name ?? '', email: user?.email ?? '' },
        theme: { color: '#0f766e' },
        handler: async (response) => {
          setBusyId(booking.id);
          try {
            await apiRequest('/payments/verify', {
              method: 'POST',
              body: {
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              },
            });
            setNotice({ kind: 'success', text: 'Razorpay test payment verified. No live transaction was made.' });
            setRefreshCount((count) => count + 1);
          } catch (error) {
            setNotice({ kind: 'error', text: error.message });
            setRefreshCount((count) => count + 1);
          } finally {
            setBusyId(null);
          }
        },
        modal: {
          ondismiss: () => {
            setBusyId(null);
            setNotice({ kind: 'error', text: 'Checkout closed before confirmation. The booking still needs payment.' });
            setRefreshCount((count) => count + 1);
          },
        },
      });
      checkout.open();
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
      setBusyId(null);
      setRefreshCount((count) => count + 1);
    }
  }

  async function requestRefund(booking) {
    if (!window.confirm(`Request a Razorpay test refund for the ${money(booking.depositAmount)} deposit? This will go to campus support for review; no refund is issued by this request.`)) return;
    setBusyId(booking.id);
    setNotice(null);
    try {
      const result = await apiRequest(`/payments/refunds/${booking.id}`, { method: 'POST' });
      setNotice({ kind: 'success', text: result.note });
      setRefreshCount((count) => count + 1);
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setBusyId(null);
    }
  }

  function submitDispute(event, booking) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    performAction(booking, 'dispute', {
      reason: String(form.get('reason') ?? '').trim(),
      details: String(form.get('details') ?? '').trim(),
    });
  }

  return (
    <main id="main" className="marketplace-page wrap">
      <div className="marketplace-heading">
        <div><div className="eyebrow">YOUR BORROWING ACTIVITY</div><h1>Bookings</h1><p>Track requests, handovers, returns, and any issues.</p></div>
        <Link className="button" to="/items">Browse items</Link>
      </div>
      <div className="booking-toolbar" role="group" aria-label="Filter bookings">
        <button className={roleFilter === 'all' ? 'booking-filter active' : 'booking-filter'} onClick={() => setRoleFilter('all')}>All bookings</button>
        <button className={roleFilter === 'borrower' ? 'booking-filter active' : 'booking-filter'} onClick={() => setRoleFilter('borrower')}>I’m borrowing</button>
        <button className={roleFilter === 'lender' ? 'booking-filter active' : 'booking-filter'} onClick={() => setRoleFilter('lender')}>I’m lending</button>
      </div>
      {paymentPolicy?.error && <div className="form-alert error" role="alert">Payment settings could not be loaded. Confirmation actions are disabled; try refreshing the page.</div>}
      {paymentPolicy && !paymentPolicy.error && <div className="booking-payment-note" role="status">{paymentPolicy.description}</div>}
      {notice && <div className={`form-alert ${notice.kind}`} role="status">{notice.text}</div>}
      {loading ? <div className="state-panel" aria-live="polite">Loading your bookings…</div>
        : result.error ? (
          <section className="state-panel error" role="alert">
            <b>We couldn’t load your bookings.</b><p>{result.error.message}</p>
            <button className="outline-button" onClick={() => setRefreshCount((count) => count + 1)}>Try again</button>
          </section>
        ) : bookings.length === 0 ? (
          <section className="state-panel"><div className="empty-mark">▣</div><h2>No bookings here yet.</h2>
            <p>{roleFilter === 'lender' ? 'Your listing requests will appear here.' : 'Request an item or share one with your campus.'}</p>
            <Link className="button" to={roleFilter === 'lender' ? '/my-listings' : '/items'}>{roleFilter === 'lender' ? 'Manage listings' : 'Browse items'}</Link>
          </section>
        ) : (
          <div className="booking-list">
            {bookings.map((booking) => {
              const otherPerson = booking.side === 'borrower' ? booking.lender : booking.borrower;
              const actions = actionsFor(booking, paymentPolicy?.mode);
              const showDisputeForm = disputeId === booking.id;
              return (
                <article className="booking-card" key={booking.id}>
                  <div className="booking-card-top">
                    <div><div className="eyebrow">{booking.side === 'borrower' ? 'YOU ARE BORROWING' : 'YOU ARE LENDING'}</div>
                      <h2><Link to={`/items/${booking.listingId}`}>{booking.listing?.title ?? 'Campus item'}</Link></h2>
                    </div>
                    <span className={`status-pill status-${booking.status}`}>{statusLabels[booking.status] ?? booking.status}</span>
                  </div>
                  <div className="booking-facts">
                    <div><small>{booking.side === 'borrower' ? 'Lender' : 'Borrower'}</small><b>{otherPerson?.fullName ?? 'Campus student'}</b></div>
                    <div><small>Borrowing dates</small><b>{dateLabel(booking.startDate)} – {dateLabel(booking.endDate)}</b></div>
                    <div><small>Campus handover</small><b>{booking.listing?.handoverLocation ?? 'Coordinate on campus'}</b></div>
                    <div><small>Borrowing total</small><b>{money(booking.totalPrice)}</b></div>
                  </div>
                  <details className="booking-costs">
                    <summary>Price and deposit details</summary>
                    <p>{money(booking.dailyPrice)} per day · {money(booking.depositAmount)} refundable deposit requested · {money(booking.lateFeePerDay)} daily late fee policy.</p>
                    {booking.overdueDays > 0 && <p className="booking-payment-note">This item is {booking.overdueDays} day{booking.overdueDays === 1 ? '' : 's'} overdue after the grace period. Any fee shown below is calculated only and has not been collected.</p>}
                    {booking.lateFees?.map((fee) => <p className="booking-payment-note" key={`${fee.daysOverdue}-${fee.createdAt}`}>Late fee record: {money(fee.amount)} · day {fee.daysOverdue} overdue · {fee.status}. No fee is automatically collected.</p>)}
                    {booking.payments?.map((payment) => <div className="booking-payment-note" key={`${payment.provider}-${payment.createdAt}`}>
                      <p>Payment record: {payment.status} · {payment.provider === 'demo' ? 'demo only' : payment.provider === 'razorpay_test' ? 'Razorpay test mode' : payment.provider} · {money(payment.amount)}.</p>
                      {payment.refunds.map((refund) => <p key={`${refund.status}-${refund.createdAt}`}>Deposit refund: {refund.status} · {money(refund.amount)}{refund.providerReference ? ` · ${refund.providerReference}` : ''}.</p>)}
                    </div>)}
                    <p className="booking-payment-note">
                      {paymentPolicy?.mode === 'razorpay_test'
                        ? 'Razorpay sandbox checkout is test-only. Any deposit refund remains a separate review step.'
                        : paymentPolicy?.mode === 'demo'
                          ? 'Demo mode records confirmation only. No payment, deposit hold, or late fee is collected.'
                          : 'No payment, deposit hold, or late fee is collected by this setup.'}
                    </p>
                  </details>
                  <details className="booking-history">
                    <summary>Activity history</summary>
                    <ol>{booking.history.map((event) => <li key={event.id}><b>{statusLabels[event.newStatus] ?? event.newStatus}</b><span>{new Date(event.createdAt).toLocaleString()}</span>{event.reason && <small>{event.reason}</small>}</li>)}</ol>
                  </details>
                  <div className="booking-actions"><Link className="outline-button" to="/messages">Message {otherPerson?.fullName ?? 'student'}</Link></div>
                  {actions.length > 0 && !showDisputeForm && (
                    <div className="booking-actions">
                      {actions.map((action) => <button
                        className={action === 'decline' || action === 'cancel' || action === 'dispute' ? 'outline-button' : 'button'}
                        key={action}
                        disabled={busyId === booking.id}
                        onClick={() => action === 'dispute' ? setDisputeId(booking.id) : action === 'pay' ? startPayment(booking) : action === 'refund' ? requestRefund(booking) : performAction(booking, action)}
                      >{busyId === booking.id ? 'Updating…' : actionLabels[action]}</button>)}
                    </div>
                  )}
                  {showDisputeForm && <form className="dispute-form" onSubmit={(event) => submitDispute(event, booking)}>
                    <h3>Report a booking issue</h3>
                    <label className="form-field">Reason<input name="reason" required minLength={2} maxLength={120} placeholder="For example, item condition" /></label>
                    <label className="form-field">What happened?<textarea name="details" required minLength={10} maxLength={5000} rows="4" placeholder="Describe the issue so campus support can review it." /></label>
                    <div className="booking-actions"><button className="button" disabled={busyId === booking.id}>{busyId === booking.id ? 'Submitting…' : 'Submit issue'}</button><button type="button" className="outline-button" onClick={() => setDisputeId(null)}>Cancel</button></div>
                  </form>}
                </article>
              );
            })}
          </div>
        )}
    </main>
  );
}
