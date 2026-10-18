import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api.js';

const statuses = ['all', 'pending', 'accepted', 'awaiting_payment', 'confirmed', 'active', 'return_requested', 'completed', 'disputed', 'declined', 'cancelled'];
const money = (value) => value === 0 ? 'Free' : `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dateLabel = (value) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  .format(new Date(`${value}T00:00:00`));

export default function AdminBookingsPage() {
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [retryCount, setRetryCount] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const requestKey = `${status}:${page}:${retryCount}`;

  useEffect(() => {
    let active = true;
    apiRequest(`/admin/bookings?status=${status}&page=${page}&pageSize=25`)
      .then((data) => { if (active) setResult({ key: requestKey, data, error: null }); })
      .catch((error) => { if (active) setResult({ key: requestKey, data: null, error }); });
    return () => { active = false; };
  }, [requestKey, status, page]);

  const loading = result.key !== requestKey;
  const data = result.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main id="main" className="marketplace-page wrap">
      <div className="marketplace-heading"><div><div className="eyebrow">CAMPUS ADMINISTRATION</div><h1>Booking oversight</h1><p>Read-only view of booking status, participants, and recorded payment state.</p></div><Link className="outline-button" to="/admin">Overview</Link></div>
      <div className="booking-toolbar" role="group" aria-label="Filter bookings by status">{statuses.map((value) => <button key={value} className={status === value ? 'booking-filter active' : 'booking-filter'} onClick={() => { setStatus(value); setPage(1); }}>{value.replaceAll('_', ' ')}</button>)}</div>
      {loading ? <div className="state-panel" aria-live="polite">Loading campus bookings…</div>
        : result.error ? <section className="state-panel error" role="alert"><b>We couldn’t load campus bookings.</b><p>{result.error.message}</p><button className="outline-button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button></section>
          : data.bookings.length === 0 ? <section className="state-panel"><h2>No bookings in this view.</h2><p>Campus booking activity will appear here.</p></section>
            : <>
              <div className="results-count">{data.total} booking{data.total === 1 ? '' : 's'}</div>
              <div className="moderation-list">{data.bookings.map((booking) => <article className="moderation-card dispute-review-card" key={booking.id}><div className="moderation-body">
                <div className="eyebrow">{booking.status.replaceAll('_', ' ').toUpperCase()}</div><h2>{booking.listing?.title ?? 'Campus item'}</h2>
                <div className="moderation-meta"><span>Borrower: <b>{booking.borrower?.fullName ?? 'Campus student'}</b></span><span>Lender: <b>{booking.lender?.fullName ?? 'Campus student'}</b></span><span>Dates: {dateLabel(booking.startDate)} – {dateLabel(booking.endDate)}</span><span>Borrowing: {money(booking.totalPrice)}</span><span>Deposit requested: {money(booking.depositAmount)}</span><span>Deposit state: {booking.depositStatus}</span></div>
                {booking.payments.length > 0 && <p className="booking-payment-note">{booking.payments.map((payment) => `${payment.provider}: ${payment.status} · ${money(payment.amount)}`).join(' | ')}</p>}
              </div></article>)}</div>
              <nav className="pagination" aria-label="Booking pages"><button className="outline-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="outline-button" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next</button></nav>
            </>}
    </main>
  );
}
