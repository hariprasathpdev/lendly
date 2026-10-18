import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api.js';

const money = (value) => value === 0 ? 'Free' : `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dateLabel = (value) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  .format(new Date(`${value}T00:00:00`));

export default function AdminOverduePage() {
  const [retryCount, setRetryCount] = useState(0);
  const [resolutions, setResolutions] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const requestKey = String(retryCount);

  useEffect(() => {
    let active = true;
    apiRequest('/admin/overdue')
      .then((data) => { if (active) setResult({ key: requestKey, data, error: null }); })
      .catch((error) => { if (active) setResult({ key: requestKey, data: null, error }); });
    return () => { active = false; };
  }, [requestKey]);

  const loading = result.key !== requestKey;

  async function decide(fee, action) {
    const resolution = (resolutions[fee.id] ?? '').trim();
    if (resolution.length < 2) {
      setNotice({ kind: 'error', text: 'Add a short note explaining this fee decision.' });
      return;
    }
    setBusyId(fee.id);
    setNotice(null);
    try {
      await apiRequest(`/admin/late-fees/${fee.id}/review`, { method: 'PATCH', body: { action, resolution } });
      setResult((current) => ({ ...current, data: { ...current.data, fees: current.data.fees.filter((item) => item.id !== fee.id) } }));
      setNotice({ kind: 'success', text: action === 'waive' ? 'Fee waived and both students were notified.' : 'Fee decision recorded and both students were notified.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main id="main" className="marketplace-page wrap">
      <div className="marketplace-heading">
        <div><div className="eyebrow">CAMPUS ADMINISTRATION</div><h1>Overdue items</h1><p>Grace period: {result.data?.graceDays ?? '—'} days. Late fees shown here are calculations only; Lendly does not collect them.</p></div>
        <span className="admin-page-links"><Link className="outline-button" to="/admin">Listings</Link><Link className="outline-button" to="/admin/reports">Student reports</Link></span>
      </div>
      {notice && <div className={`form-alert ${notice.kind}`} role="status">{notice.text}</div>}
      {loading ? <div className="state-panel" aria-live="polite">Loading overdue activity…</div>
        : result.error ? <section className="state-panel error" role="alert"><b>We couldn’t load overdue activity.</b><p>{result.error.message}</p><button className="outline-button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button></section>
          : <>
            <section className="overdue-section">
              <div className="section-heading"><div><div className="eyebrow">ACTIVE BORROWINGS</div><h2>Past the return date</h2></div><span>{result.data.bookings.length} booking{result.data.bookings.length === 1 ? '' : 's'}</span></div>
              {result.data.bookings.length === 0 ? <div className="state-panel"><h3>No overdue active bookings.</h3><p>Active bookings past their return date will appear here after the scheduled check.</p></div>
                : <div className="moderation-list">{result.data.bookings.map((booking) => <article className="moderation-card dispute-review-card" key={booking.id}>
                  <div className="moderation-body"><div className="eyebrow">{booking.daysOverdue} DAY{booking.daysOverdue === 1 ? '' : 'S'} OVERDUE</div>
                    <h3>{booking.listing?.title ?? 'Campus item'}</h3>
                    <div className="moderation-meta"><span>Return date: <b>{dateLabel(booking.endDate)}</b></span><span>Borrower: <b>{booking.borrower?.fullName ?? 'Campus student'}</b></span><span>Lender: <b>{booking.lender?.fullName ?? 'Campus student'}</b></span><span>Estimated fee to date: <b>{money(booking.estimatedLateFees)}</b></span></div>
                    <p className="booking-payment-note">The borrower and lender receive an in-app reminder once per day. Any daily fee is a record for review only.</p>
                  </div>
                </article>)}</div>}
            </section>
            <section className="overdue-section">
              <div className="section-heading"><div><div className="eyebrow">FEE REVIEW</div><h2>Calculated daily fees</h2></div><span>{result.data.fees.length} awaiting decision</span></div>
              {result.data.fees.length === 0 ? <div className="state-panel"><h3>No calculated fees need review.</h3><p>Daily records from the scheduled overdue check will appear here.</p></div>
                : <div className="moderation-list">{result.data.fees.map((fee) => <article className="moderation-card dispute-review-card" key={fee.id}>
                  <div className="moderation-body"><div className="eyebrow">{fee.status.toUpperCase()} · DAY {fee.daysOverdue}</div>
                    <h3>{fee.booking?.listing?.title ?? 'Campus item'} · {money(fee.amount)}</h3>
                    <div className="moderation-meta"><span>Borrower: <b>{fee.booking?.borrower?.fullName ?? 'Campus student'}</b></span><span>Lender: <b>{fee.booking?.lender?.fullName ?? 'Campus student'}</b></span><span>Grace period: {fee.graceDays} days</span><span>Booking: {fee.booking?.status ?? 'unknown'}</span></div>
                    <p>{fee.reason}</p>
                    <label className="form-field">Decision note<textarea rows="2" maxLength={2000} value={resolutions[fee.id] ?? ''} onChange={(event) => setResolutions((current) => ({ ...current, [fee.id]: event.target.value }))} placeholder="Record why the fee is confirmed or waived." /></label>
                    <div className="booking-actions"><button className="button" disabled={busyId === fee.id} onClick={() => decide(fee, 'confirm')}>Confirm calculation</button><button className="outline-button" disabled={busyId === fee.id} onClick={() => decide(fee, 'waive')}>Waive fee</button></div>
                  </div>
                </article>)}</div>}
            </section>
          </>}
    </main>
  );
}
