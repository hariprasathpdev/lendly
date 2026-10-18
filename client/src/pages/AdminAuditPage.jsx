import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api.js';

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [retryCount, setRetryCount] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const requestKey = `${page}:${retryCount}`;

  useEffect(() => {
    let active = true;
    apiRequest(`/admin/audit?page=${page}&pageSize=50`)
      .then((data) => { if (active) setResult({ key: requestKey, data, error: null }); })
      .catch((error) => { if (active) setResult({ key: requestKey, data: null, error }); });
    return () => { active = false; };
  }, [requestKey, page]);

  const loading = result.key !== requestKey;
  const data = result.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main id="main" className="marketplace-page wrap">
      <div className="marketplace-heading"><div><div className="eyebrow">CAMPUS ADMINISTRATION</div><h1>Administrator audit history</h1><p>Review recorded moderation, dispute, report, refund, and fee decisions.</p></div><span className="admin-page-links"><Link className="outline-button" to="/admin">Overview</Link><Link className="outline-button" to="/admin/users">Student accounts</Link></span></div>
      {loading ? <div className="state-panel" aria-live="polite">Loading audit history…</div>
        : result.error ? <section className="state-panel error" role="alert"><b>We couldn’t load audit history.</b><p>{result.error.message}</p><button className="outline-button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button></section>
          : data.entries.length === 0 ? <section className="state-panel"><h2>No admin actions have been recorded.</h2><p>Actions taken through the admin tools will appear here.</p></section>
            : <>
              <div className="results-count">{data.total} audit entr{data.total === 1 ? 'y' : 'ies'}</div>
              <div className="moderation-list">{data.entries.map((entry) => <article className="moderation-card dispute-review-card" key={entry.id}><div className="moderation-body">
                <div className="eyebrow">{entry.targetType.toUpperCase()} · {new Date(entry.createdAt).toLocaleString()}</div><h2>{entry.action.replaceAll('.', ' · ')}</h2>
                <div className="moderation-meta"><span>Administrator: <b>{entry.admin?.fullName ?? 'Campus administrator'}</b></span><span>Target: {entry.targetId ?? '—'}</span></div>
                {Object.keys(entry.metadata ?? {}).length > 0 && <pre className="audit-metadata">{JSON.stringify(entry.metadata, null, 2)}</pre>}
              </div></article>)}</div>
              <nav className="pagination" aria-label="Audit history pages"><button className="outline-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="outline-button" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next</button></nav>
            </>}
    </main>
  );
}
