import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api.js';

const money = (value) => value === 0 ? 'Free' : `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function AdminPage() {
  const [queueStatus, setQueueStatus] = useState('pending_review');
  const [retryCount, setRetryCount] = useState(0);
  const [reasons, setReasons] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [result, setResult] = useState({ key: null, listings: [], error: null });
  const requestKey = `${queueStatus}:${retryCount}`;

  useEffect(() => {
    let active = true;
    apiRequest(`/admin/listings?status=${queueStatus}`)
      .then(({ listings }) => {
        if (active) setResult({ key: requestKey, listings, error: null });
      })
      .catch((error) => {
        if (active) setResult({ key: requestKey, listings: [], error });
      });
    return () => { active = false; };
  }, [queueStatus, requestKey]);

  const loading = result.key !== requestKey;

  async function review(listing, action) {
    const reason = (reasons[listing.id] ?? '').trim();
    if (action === 'reject' && reason.length < 2) {
      setNotice({ kind: 'error', text: 'Add a short reason before rejecting this listing.' });
      return;
    }
    const prompt = action === 'approve' ? `Approve “${listing.title}”?` : `Reject “${listing.title}” and send the owner this reason?`;
    if (!window.confirm(prompt)) return;
    setBusyId(listing.id);
    setNotice(null);
    try {
      await apiRequest(`/admin/listings/${listing.id}/review`, {
        method: 'PATCH',
        body: { action, ...(action === 'reject' ? { reason } : {}) },
      });
      setResult((current) => ({ ...current, listings: current.listings.filter((item) => item.id !== listing.id) }));
      setNotice({ kind: 'success', text: `Listing ${action === 'approve' ? 'approved' : 'returned for changes'}.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main id="main" className="marketplace-page wrap">
      <div className="marketplace-heading">
        <div><div className="eyebrow">CAMPUS ADMINISTRATION</div><h1>Listing moderation</h1><p>Review student listings and give clear feedback on changes.</p></div>
        <span className="admin-page-links"><Link className="outline-button" to="/admin/disputes">Review disputes</Link><Link className="outline-button" to="/admin/reports">Review reports</Link><Link className="outline-button" to="/admin/overdue">Overdue items</Link><Link className="outline-button" to="/admin/refunds">Review refunds</Link><Link className="outline-button" to="/dashboard">Student dashboard</Link></span>
      </div>
      <div className="booking-toolbar" role="group" aria-label="Moderation queue">
        <button className={queueStatus === 'pending_review' ? 'booking-filter active' : 'booking-filter'} onClick={() => setQueueStatus('pending_review')}>Awaiting review</button>
        <button className={queueStatus === 'rejected' ? 'booking-filter active' : 'booking-filter'} onClick={() => setQueueStatus('rejected')}>Returned for changes</button>
      </div>
      <p className="booking-payment-note">Review listing text and photos. Approval makes the item visible to verified students at the same campus.</p>
      {notice && <div className={`form-alert ${notice.kind}`} role="status">{notice.text}</div>}
      {loading ? <div className="state-panel" aria-live="polite">Loading the moderation queue…</div>
        : result.error ? <section className="state-panel error" role="alert"><b>We couldn’t load the review queue.</b><p>{result.error.message}</p><button className="outline-button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button></section>
          : result.listings.length === 0 ? <section className="state-panel"><div className="empty-mark">✓</div><h2>Nothing to review.</h2><p>New submissions will appear in this queue.</p></section>
            : <div className="moderation-list">{result.listings.map((listing) => <article className="moderation-card" key={listing.id}>
              <div className="moderation-media">{listing.photos.map((photo) => photo.url && <img src={photo.url} alt={listing.title} key={photo.id} />)}</div>
              <div className="moderation-body">
                <div className="eyebrow">{listing.category?.name ?? 'CAMPUS ITEM'} · {listing.condition.replace('_', ' ').toUpperCase()}</div>
                <h2>{listing.title}</h2><p>{listing.description}</p>
                <div className="moderation-meta"><span>Submitted by <b>{listing.owner?.fullName ?? 'Campus student'}</b></span><span>{money(listing.pricePerDay)} / day</span><span>Deposit requested: {money(listing.depositAmount)}</span><span>Handover: {listing.handoverLocation}</span></div>
                {listing.rules && <p><b>Rules:</b> {listing.rules}</p>}
                {queueStatus === 'pending_review' && <label className="form-field">Reason for rejection<textarea rows="2" maxLength={1000} value={reasons[listing.id] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [listing.id]: event.target.value }))} placeholder="Tell the student what needs to change before resubmitting." /></label>}
                <div className="booking-actions">
                  <button className="button" disabled={busyId === listing.id} onClick={() => review(listing, 'approve')}>{busyId === listing.id ? 'Saving…' : 'Approve listing'}</button>
                  {queueStatus === 'pending_review' && <button className="outline-button" disabled={busyId === listing.id} onClick={() => review(listing, 'reject')}>Return for changes</button>}
                  {queueStatus === 'rejected' && <span className="booking-payment-note">The owner can edit and resubmit this listing.</span>}
                </div>
              </div>
            </article>)}</div>}
    </main>
  );
}
