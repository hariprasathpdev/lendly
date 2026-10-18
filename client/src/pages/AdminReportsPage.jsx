import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api.js';

export default function AdminReportsPage() {
  const [status, setStatus] = useState('open');
  const [retryCount, setRetryCount] = useState(0);
  const [resolutions, setResolutions] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [result, setResult] = useState({ key: null, reports: [], error: null });
  const requestKey = `${status}:${retryCount}`;

  useEffect(() => {
    let active = true;
    apiRequest(`/admin/reports?status=${status}`)
      .then(({ reports }) => { if (active) setResult({ key: requestKey, reports, error: null }); })
      .catch((error) => { if (active) setResult({ key: requestKey, reports: [], error }); });
    return () => { active = false; };
  }, [requestKey, status]);

  const loading = result.key !== requestKey;

  async function review(report, action) {
    const resolution = (resolutions[report.id] ?? '').trim();
    if (action !== 'review' && resolution.length < 2) {
      setNotice({ kind: 'error', text: 'Add a short resolution note before closing this report.' });
      return;
    }
    setBusyId(report.id);
    setNotice(null);
    try {
      await apiRequest(`/admin/reports/${report.id}/review`, {
        method: 'PATCH',
        body: { action, ...(action === 'review' ? {} : { resolution }) },
      });
      setResult((current) => ({ ...current, reports: current.reports.filter((item) => item.id !== report.id) }));
      setNotice({ kind: 'success', text: action === 'review' ? 'Report moved to the review queue.' : `Report ${action === 'resolve' ? 'resolved' : 'dismissed'} and the student was notified.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main id="main" className="marketplace-page wrap">
      <div className="marketplace-heading">
        <div><div className="eyebrow">CAMPUS ADMINISTRATION</div><h1>Student reports</h1><p>Review listing and booking reports, then record the outcome for the reporter.</p></div>
        <span className="admin-page-links"><Link className="outline-button" to="/admin">Listings</Link><Link className="outline-button" to="/admin/overdue">Overdue items</Link></span>
      </div>
      <div className="booking-toolbar" role="group" aria-label="Report queue">
        <button className={status === 'open' ? 'booking-filter active' : 'booking-filter'} onClick={() => setStatus('open')}>New reports</button>
        <button className={status === 'under_review' ? 'booking-filter active' : 'booking-filter'} onClick={() => setStatus('under_review')}>Under review</button>
      </div>
      {notice && <div className={`form-alert ${notice.kind}`} role="status">{notice.text}</div>}
      {loading ? <div className="state-panel" aria-live="polite">Loading reports…</div>
        : result.error ? <section className="state-panel error" role="alert"><b>We couldn’t load the reports.</b><p>{result.error.message}</p><button className="outline-button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button></section>
          : result.reports.length === 0 ? <section className="state-panel"><div className="empty-mark">✓</div><h2>No reports in this queue.</h2><p>New student reports will appear here.</p></section>
            : <div className="moderation-list">{result.reports.map((report) => <article className="moderation-card dispute-review-card" key={report.id}>
              <div className="moderation-body">
                <div className="eyebrow">{report.listing ? 'LISTING REPORT' : 'BOOKING REPORT'} · {new Date(report.createdAt).toLocaleDateString()}</div>
                <h2>{report.reason}</h2><p>{report.details}</p>
                <div className="moderation-meta">
                  <span>Reported by <b>{report.reporter?.fullName ?? 'Campus student'}</b></span>
                  {report.listing && <span>Listing: <b>{report.listing.title}</b> · owner {report.listing.owner?.fullName ?? 'Campus student'}</span>}
                  {report.booking && <span>Booking: <b>{report.booking.listingTitle}</b> · {report.booking.status}</span>}
                </div>
                {status === 'under_review' && <label className="form-field">Resolution note<textarea rows="3" maxLength={2000} value={resolutions[report.id] ?? ''} onChange={(event) => setResolutions((current) => ({ ...current, [report.id]: event.target.value }))} placeholder="Record the action taken or why this report is being closed." /></label>}
                <div className="booking-actions">
                  {status === 'open'
                    ? <button className="button" disabled={busyId === report.id} onClick={() => review(report, 'review')}>{busyId === report.id ? 'Saving…' : 'Start review'}</button>
                    : <>
                      <button className="button" disabled={busyId === report.id} onClick={() => review(report, 'resolve')}>{busyId === report.id ? 'Saving…' : 'Resolve report'}</button>
                      <button className="outline-button" disabled={busyId === report.id} onClick={() => review(report, 'dismiss')}>Dismiss report</button>
                    </>}
                </div>
              </div>
            </article>)}</div>}
    </main>
  );
}
