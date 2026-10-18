import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api.js';

const money = (value) => `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dateLabel = (value) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  .format(new Date(`${value}T00:00:00`));

export default function AdminRefundsPage() {
  const [retryCount, setRetryCount] = useState(0);
  const [providerReferences, setProviderReferences] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [result, setResult] = useState({ key: null, refunds: [], error: null });
  const requestKey = String(retryCount);

  useEffect(() => {
    let active = true;
    apiRequest('/admin/refunds')
      .then(({ refunds }) => { if (active) setResult({ key: requestKey, refunds, error: null }); })
      .catch((error) => { if (active) setResult({ key: requestKey, refunds: [], error }); });
    return () => { active = false; };
  }, [requestKey]);

  async function review(refund, action) {
    const providerReference = (providerReferences[refund.id] ?? '').trim();
    if (action === 'issued' && !/^rfnd_[A-Za-z0-9]+$/.test(providerReference)) {
      setNotice({ kind: 'error', text: 'Enter the Razorpay refund reference, beginning with rfnd_.' });
      return;
    }
    const actionText = action === 'approve'
      ? 'approve the refund request for manual issuance in Razorpay test mode'
      : action === 'reject'
        ? 'reject this refund request without issuing money'
        : action === 'issued'
          ? 'record that the Razorpay test dashboard issued this refund'
          : 'mark the provider refund attempt as failed';
    if (!window.confirm(`This will ${actionText}. Continue?`)) return;
    setBusyId(refund.id);
    setNotice(null);
    try {
      const data = await apiRequest(`/admin/refunds/${refund.id}/review`, {
        method: 'PATCH',
        body: { action, ...(action === 'issued' ? { providerReference } : {}) },
      });
      setNotice({ kind: 'success', text: data.note });
      setRetryCount((count) => count + 1);
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setBusyId(null);
    }
  }

  const loading = result.key !== requestKey;

  return (
    <main id="main" className="marketplace-page wrap">
      <div className="marketplace-heading">
        <div><div className="eyebrow">CAMPUS ADMINISTRATION</div><h1>Deposit refunds</h1><p>Review requests and record Razorpay test refunds after checking the provider dashboard.</p></div>
        <span className="admin-page-links"><Link className="outline-button" to="/admin">Listing moderation</Link><Link className="outline-button" to="/admin/disputes">Review disputes</Link></span>
      </div>
      <div className="booking-payment-note" role="note">Approving a request does not issue money. Issue the partial refund for the exact deposit amount in the Razorpay test dashboard, then record its <code>rfnd_</code> reference here.</div>
      {notice && <div className={`form-alert ${notice.kind}`} role="status">{notice.text}</div>}
      {loading ? <div className="state-panel" aria-live="polite">Loading refund requests…</div>
        : result.error ? <section className="state-panel error" role="alert"><b>We couldn’t load refund requests.</b><p>{result.error.message}</p><button className="outline-button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button></section>
          : result.refunds.length === 0 ? <section className="state-panel"><div className="empty-mark">✓</div><h2>No refunds need review.</h2><p>Only completed Razorpay test bookings with a captured refundable deposit appear here.</p></section>
            : <div className="moderation-list">{result.refunds.map((refund) => <article className="moderation-card" key={refund.id}>
              <div className="moderation-body">
                <div className="eyebrow">DEPOSIT REFUND · {new Date(refund.createdAt).toLocaleDateString()}</div>
                <h2>{money(refund.amount)} · {refund.status.replace('_', ' ')}</h2>
                <div className="moderation-meta">
                  <span>Borrower: <b>{refund.payment?.payer?.fullName ?? 'Campus student'}</b></span>
                  <span>Item: <b>{refund.payment?.booking?.listing?.title ?? 'Campus item'}</b></span>
                  {refund.payment?.booking && <span>{dateLabel(refund.payment.booking.startDate)} – {dateLabel(refund.payment.booking.endDate)}</span>}
                  <span>Provider payment: <b>{refund.payment?.providerPaymentId ?? 'Not available'}</b></span>
                  {refund.providerReference && <span>Refund reference: <b>{refund.providerReference}</b></span>}
                </div>
                {refund.status === 'approved' && <>
                  <label className="form-field">Razorpay refund reference<input value={providerReferences[refund.id] ?? ''} onChange={(event) => setProviderReferences((current) => ({ ...current, [refund.id]: event.target.value }))} placeholder="rfnd_…" autoComplete="off" /></label>
                  <div className="booking-actions"><button className="button" disabled={busyId === refund.id} onClick={() => review(refund, 'issued')}>Record issued refund</button><button className="outline-button" disabled={busyId === refund.id} onClick={() => review(refund, 'failed')}>Mark provider attempt failed</button></div>
                </>}
                {['requested', 'failed'].includes(refund.status) && <div className="booking-actions">
                  <button className="button" disabled={busyId === refund.id} onClick={() => review(refund, 'approve')}>{refund.status === 'failed' ? 'Approve another attempt' : 'Approve request'}</button>
                  <button className="outline-button" disabled={busyId === refund.id} onClick={() => review(refund, 'reject')}>Reject request</button>
                </div>}
              </div>
            </article>)}</div>}
    </main>
  );
}
