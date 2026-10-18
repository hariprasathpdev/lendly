import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api.js';

const dateLabel = (value) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  .format(new Date(`${value}T00:00:00`));

export default function AdminDisputesPage() {
  const [retryCount, setRetryCount] = useState(0);
  const [resolutions, setResolutions] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [result, setResult] = useState({ key: null, disputes: [], error: null });
  const requestKey = String(retryCount);

  useEffect(() => {
    let active = true;
    apiRequest('/admin/disputes?status=open')
      .then(({ disputes }) => {
        if (active) setResult({ key: requestKey, disputes, error: null });
      })
      .catch((error) => {
        if (active) setResult({ key: requestKey, disputes: [], error });
      });
    return () => { active = false; };
  }, [requestKey]);

  const loading = result.key !== requestKey;

  async function decide(dispute, action) {
    const resolution = (resolutions[dispute.id] ?? '').trim();
    if (resolution.length < 2) {
      setNotice({ kind: 'error', text: 'Add a resolution note before closing this dispute.' });
      return;
    }
    const actionText = action === 'complete' ? 'mark the borrowing complete' : action === 'cancel' ? 'cancel the booking' : 'dismiss the dispute and restore its previous booking state';
    if (!window.confirm(`This will ${actionText}. Continue?`)) return;
    setBusyId(dispute.id);
    setNotice(null);
    try {
      await apiRequest(`/admin/disputes/${dispute.id}/review`, {
        method: 'PATCH',
        body: { action, resolution },
      });
      setResult((current) => ({ ...current, disputes: current.disputes.filter((item) => item.id !== dispute.id) }));
      setNotice({ kind: 'success', text: 'The dispute decision was recorded and both students were notified.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main id="main" className="marketplace-page wrap">
      <div className="marketplace-heading"><div><div className="eyebrow">CAMPUS ADMINISTRATION</div><h1>Dispute review</h1><p>Review the report and record a clear outcome for both students.</p></div><Link className="outline-button" to="/admin">Listing moderation</Link></div>
      {notice && <div className={`form-alert ${notice.kind}`} role="status">{notice.text}</div>}
      {loading ? <div className="state-panel" aria-live="polite">Loading open disputes…</div>
        : result.error ? <section className="state-panel error" role="alert"><b>We couldn’t load open disputes.</b><p>{result.error.message}</p><button className="outline-button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button></section>
          : result.disputes.length === 0 ? <section className="state-panel"><div className="empty-mark">✓</div><h2>No open disputes.</h2><p>New booking issues will appear here.</p></section>
            : <div className="moderation-list">{result.disputes.map((dispute) => <article className="moderation-card dispute-review-card" key={dispute.id}>
              <div className="moderation-body">
                <div className="eyebrow">BOOKING ISSUE · {new Date(dispute.createdAt).toLocaleDateString()}</div>
                <h2>{dispute.reason}</h2><p>{dispute.details}</p>
                <div className="moderation-meta">
                  <span>Item: <b>{dispute.booking?.listing?.title ?? 'Campus item'}</b></span>
                  <span>Borrower: <b>{dispute.booking?.borrower?.fullName ?? 'Campus student'}</b></span>
                  <span>Lender: <b>{dispute.booking?.lender?.fullName ?? 'Campus student'}</b></span>
                  {dispute.booking && <span>{dateLabel(dispute.booking.startDate)} – {dateLabel(dispute.booking.endDate)}</span>}
                </div>
                <label className="form-field">Resolution note<textarea rows="3" maxLength={2000} value={resolutions[dispute.id] ?? ''} onChange={(event) => setResolutions((current) => ({ ...current, [dispute.id]: event.target.value }))} placeholder="Summarize what was reviewed and the agreed outcome." /></label>
                <div className="booking-actions">
                  <button className="button" disabled={busyId === dispute.id} onClick={() => decide(dispute, 'complete')}>Resolve · complete</button>
                  <button className="outline-button" disabled={busyId === dispute.id} onClick={() => decide(dispute, 'cancel')}>Resolve · cancel booking</button>
                  <button className="text-button" disabled={busyId === dispute.id} onClick={() => decide(dispute, 'dismiss')}>Dismiss · restore prior state</button>
                </div>
              </div>
            </article>)}</div>}
    </main>
  );
}
