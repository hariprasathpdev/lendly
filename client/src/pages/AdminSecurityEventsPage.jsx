import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api.js';

const titles = {
  admin_access_denied: 'Student account attempted an admin action',
  invalid_payment_signature: 'Checkout signature verification failed',
};

const dateTime = (value) => new Date(value).toLocaleString();

export default function AdminSecurityEventsPage() {
  const [status, setStatus] = useState('open');
  const [retryCount, setRetryCount] = useState(0);
  const [resolutions, setResolutions] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [result, setResult] = useState({ key: null, events: [], total: 0, error: null });
  const requestKey = `${status}:${retryCount}`;

  useEffect(() => {
    let active = true;
    apiRequest(`/admin/security-events?status=${status}`)
      .then(({ events, total }) => { if (active) setResult({ key: requestKey, events, total, error: null }); })
      .catch((error) => { if (active) setResult({ key: requestKey, events: [], total: 0, error }); });
    return () => { active = false; };
  }, [requestKey, status]);

  const loading = result.key !== requestKey;

  async function review(event, action) {
    const resolution = (resolutions[event.id] ?? '').trim();
    if (action !== 'review' && resolution.length < 2) {
      setNotice({ kind: 'error', text: 'Add a short review note before closing this event.' });
      return;
    }
    setBusyId(event.id);
    setNotice(null);
    try {
      await apiRequest(`/admin/security-events/${event.id}/review`, {
        method: 'PATCH',
        body: { action, ...(action === 'review' ? {} : { resolution }) },
      });
      setResult((current) => ({ ...current, total: Math.max(0, current.total - 1), events: current.events.filter((item) => item.id !== event.id) }));
      setNotice({ kind: 'success', text: action === 'review' ? 'Event moved to the review queue.' : `Security event ${action === 'resolve' ? 'resolved' : 'dismissed'}.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main id="main" className="marketplace-page wrap">
      <div className="marketplace-heading">
        <div><div className="eyebrow">CAMPUS ADMINISTRATION</div><h1>Security activity</h1><p>Review repeated admin access denials and checkout signature failures. Events are grouped by account and hour.</p></div>
        <span className="admin-page-links"><Link className="outline-button" to="/admin">Overview</Link><Link className="outline-button" to="/admin/audit">Audit history</Link></span>
      </div>
      <div className="booking-toolbar" role="group" aria-label="Security event queue">
        {['open', 'under_review', 'resolved', 'dismissed'].map((value) => <button key={value} className={status === value ? 'booking-filter active' : 'booking-filter'} onClick={() => setStatus(value)}>{value.replace('_', ' ')}</button>)}
      </div>
      {notice && <div className={`form-alert ${notice.kind}`} role="status">{notice.text}</div>}
      {loading ? <div className="state-panel" aria-live="polite">Loading security activity…</div>
        : result.error ? <section className="state-panel error" role="alert"><b>We couldn’t load the security queue.</b><p>{result.error.message}</p><button className="outline-button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button></section>
          : result.events.length === 0 ? <section className="state-panel"><div className="empty-mark">✓</div><h2>No events in this queue.</h2><p>Supported security signals will appear here when detected.</p></section>
            : <>
              <div className="results-count">{result.total} security event{result.total === 1 ? '' : 's'}</div>
              <div className="moderation-list">{result.events.map((event) => <article className="moderation-card dispute-review-card" key={event.id}>
                <div className="moderation-body">
                  <div className="eyebrow">{event.severity.toUpperCase()} · {event.source.replace('_', ' ').toUpperCase()}</div>
                  <h2>{titles[event.eventType] ?? 'Security event'}</h2>
                  <div className="moderation-meta">
                    <span>Account: <b>{event.actor?.fullName ?? 'Former campus account'}</b></span>
                    <span>Occurrences: <b>{event.occurrenceCount}</b></span>
                    <span>First seen: {dateTime(event.firstSeenAt)}</span>
                    <span>Last seen: {dateTime(event.lastSeenAt)}</span>
                  </div>
                  {status === 'under_review' && <label className="form-field">Review note<textarea rows="3" maxLength={2000} value={resolutions[event.id] ?? ''} onChange={(e) => setResolutions((current) => ({ ...current, [event.id]: e.target.value }))} placeholder="Record what you checked and why this event is being closed." /></label>}
                  <div className="booking-actions">
                    {status === 'open'
                      ? <button className="button" disabled={busyId === event.id} onClick={() => review(event, 'review')}>{busyId === event.id ? 'Saving…' : 'Start review'}</button>
                      : status === 'under_review' && <>
                        <button className="button" disabled={busyId === event.id} onClick={() => review(event, 'resolve')}>{busyId === event.id ? 'Saving…' : 'Resolve event'}</button>
                        <button className="outline-button" disabled={busyId === event.id} onClick={() => review(event, 'dismiss')}>Dismiss event</button>
                      </>}
                  </div>
                </div>
              </article>)}</div>
            </>}
    </main>
  );
}
