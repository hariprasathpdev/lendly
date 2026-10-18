import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api.js';

const dateLabel = (value) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  .format(new Date(value));

export default function AdminUsersPage() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const [retryCount, setRetryCount] = useState(0);
  const requestKey = `${search}:${page}:${retryCount}`;

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (search) params.set('q', search);
    apiRequest(`/admin/users?${params}`)
      .then((data) => { if (active) setResult({ key: requestKey, data, error: null }); })
      .catch((error) => { if (active) setResult({ key: requestKey, data: null, error }); });
    return () => { active = false; };
  }, [requestKey, page, search]);

  const loading = result.key !== requestKey;

  function submit(event) {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
  }

  const data = result.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main id="main" className="marketplace-page wrap">
      <div className="marketplace-heading"><div><div className="eyebrow">CAMPUS ADMINISTRATION</div><h1>Student accounts</h1><p>Review verified campus accounts. Role changes remain an operator-only database action.</p></div><span className="admin-page-links"><Link className="outline-button" to="/admin">Overview</Link><Link className="outline-button" to="/admin/audit">Audit history</Link></span></div>
      <form className="filter-bar" onSubmit={submit}><label>Search name or college email<input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} /></label><button className="button">Search accounts</button></form>
      {loading ? <div className="state-panel" aria-live="polite">Loading student accounts…</div>
        : result.error ? <section className="state-panel error" role="alert"><b>We couldn’t load student accounts.</b><p>{result.error.message}</p><button className="outline-button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button></section>
          : data.users.length === 0 ? <section className="state-panel"><h2>No matching accounts.</h2><p>Try another name or college email.</p></section>
            : <>
              <div className="results-count">{data.total} student account{data.total === 1 ? '' : 's'}</div>
              <div className="moderation-list">{data.users.map((user) => <article className="moderation-card dispute-review-card" key={user.id}><div className="moderation-body">
                <div className="eyebrow">{user.role.toUpperCase()} · {user.college}</div><h2>{user.fullName}</h2>
                <div className="moderation-meta"><span>College email: <b>{user.email}</b></span><span>Email verified: <b>{user.verified ? 'Yes' : 'No'}</b></span><span>Policies accepted: <b>{user.termsAccepted ? 'Yes' : 'No'}</b></span><span>Joined: {dateLabel(user.createdAt)}</span></div>
              </div></article>)}</div>
              <nav className="pagination" aria-label="Student account pages"><button className="outline-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="outline-button" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next</button></nav>
            </>}
    </main>
  );
}
