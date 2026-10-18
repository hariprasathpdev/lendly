import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../services/api.js';
import ListingCard from './ListingCard.jsx';

function ErrorState({ message, onRetry }) {
  return (
    <section className="state-panel error" role="alert">
      <b>We couldn’t load the campus collection.</b>
      <p>{message}</p>
      <button className="outline-button" onClick={onRetry}>Try again</button>
    </section>
  );
}

export default function ItemsPage() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const [retryCount, setRetryCount] = useState(0);
  const [categories, setCategories] = useState([]);
  const [categoryError, setCategoryError] = useState(null);
  const [results, setResults] = useState({ key: null, items: [], total: 0, error: null });
  const requestKey = `${query}:${retryCount}`;

  useEffect(() => {
    let active = true;
    apiRequest('/categories')
      .then((rows) => {
        if (active) {
          setCategories(rows);
          setCategoryError(null);
        }
      })
      .catch((error) => {
        if (active) setCategoryError(error.message);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest(`/items${query ? `?${query}` : ''}`)
      .then((data) => {
        if (active) setResults({ key: requestKey, items: data.items, total: data.total, error: null });
      })
      .catch((error) => {
        if (active) setResults({ key: requestKey, items: [], total: 0, error });
      });
    return () => { active = false; };
  }, [query, requestKey]);

  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string' && value.trim()) next.set(key, value.trim());
    }
    setParams(next);
  }

  const page = Math.max(1, Number(params.get('page') || 1));
  const pageSize = Math.max(1, Number(params.get('pageSize') || 12));
  const pages = Math.max(1, Math.ceil(results.total / pageSize));
  const loading = results.key !== requestKey;
  const error = loading ? null : results.error;
  const items = loading ? [] : results.items;

  function changePage(nextPage) {
    const updated = new URLSearchParams(params);
    updated.set('page', String(nextPage));
    setParams(updated);
  }

  return (
    <main id="main" className="marketplace-page wrap">
      <div className="marketplace-heading">
        <div>
          <div className="eyebrow">THE CAMPUS COLLECTION</div>
          <h1>Find your next useful thing.</h1>
          <p>Borrow what you need from verified students on your campus.</p>
        </div>
        <Link className="button" to="/my-listings/new">List an item <span aria-hidden="true">＋</span></Link>
      </div>

      <form className="filter-bar" onSubmit={submit} key={query}>
        <label>Search<input name="q" defaultValue={params.get('q') ?? ''} placeholder="Books, calculators, lab tools…" /></label>
        <label>Category<select name="category" defaultValue={params.get('category') ?? ''} disabled={Boolean(categoryError)}>
          <option value="">All categories</option>
          {categories.map((category) => <option value={category.slug} key={category.id}>{category.name}</option>)}
        </select></label>
        <label>Condition<select name="condition" defaultValue={params.get('condition') ?? ''}>
          <option value="">Any condition</option><option value="new">New</option><option value="like_new">Like new</option><option value="good">Good</option><option value="fair">Fair</option>
        </select></label>
        <label>Min price<input name="minPrice" type="number" min="0" step="0.01" defaultValue={params.get('minPrice') ?? ''} placeholder="₹0" /></label>
        <label>Max price<input name="maxPrice" type="number" min="0" step="0.01" defaultValue={params.get('maxPrice') ?? ''} placeholder="No limit" /></label>
        <label>Start date<input name="startDate" type="date" defaultValue={params.get('startDate') ?? ''} /></label>
        <label>End date<input name="endDate" type="date" defaultValue={params.get('endDate') ?? ''} /></label>
        <label>Sort by<select name="sort" defaultValue={params.get('sort') ?? 'newest'}>
          <option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option>
        </select></label>
        <button className="button filter-submit">Apply filters</button>
      </form>

      {categoryError && <p className="inline-note">Category filters are unavailable: {categoryError}</p>}
      {error ? <ErrorState message={error.message} onRetry={() => setRetryCount((count) => count + 1)} />
        : loading ? <div className="state-panel" aria-live="polite">Loading campus items…</div>
          : items.length === 0 ? (
            <section className="state-panel">
              <div className="empty-mark">⌕</div><h2>No items match those filters.</h2>
              <p>Try a different search or clear the filters.</p>
              <button className="outline-button" onClick={() => setParams(new URLSearchParams())}>Clear filters</button>
            </section>
          ) : (
            <>
              <div className="results-count">{results.total} {results.total === 1 ? 'item' : 'items'} available to browse</div>
              <div className="listing-grid">{items.map((item) => <ListingCard key={item.id} item={item} />)}</div>
              <nav className="pagination" aria-label="Item pages">
                <button className="outline-button" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button>
                <span>Page {page} of {pages}</span>
                <button className="outline-button" disabled={page >= pages} onClick={() => changePage(page + 1)}>Next</button>
              </nav>
            </>
          )}
    </main>
  );
}
