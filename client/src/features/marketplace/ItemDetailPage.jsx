import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiRequest } from '../../services/api.js';
import ListingCard from './ListingCard.jsx';

const money = (value) => value === 0 ? 'Free' : `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const localDateInput = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const todayDate = localDateInput(new Date());
const dateCount = (start, end) => {
  if (!start || !end) return 0;
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(startTime) && Number.isFinite(endTime) && endTime >= startTime
    ? Math.floor((endTime - startTime) / 86400000) + 1
    : 0;
};

export default function ItemDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [retryCount, setRetryCount] = useState(0);
  const [result, setResult] = useState({ key: null, item: null, error: null });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestMessage, setRequestMessage] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMessage, setReportMessage] = useState(null);
  const [ownerReviews, setOwnerReviews] = useState({ userId: null, data: null, error: null });
  const [relatedItems, setRelatedItems] = useState({ key: null, items: [], error: null });
  const requestKey = `${id}:${retryCount}`;

  useEffect(() => {
    let active = true;
    apiRequest(`/items/${id}`)
      .then((item) => {
        if (active) setResult({ key: requestKey, item, error: null });
      })
      .catch((error) => {
        if (active) setResult({ key: requestKey, item: null, error });
      });
    return () => { active = false; };
  }, [id, requestKey]);

  useEffect(() => {
    const userId = result.item?.owner?.id;
    if (!userId) return undefined;
    let active = true;
    apiRequest(`/reviews/users/${userId}?pageSize=3`)
      .then((data) => { if (active) setOwnerReviews({ userId, data, error: null }); })
      .catch((error) => { if (active) setOwnerReviews({ userId, data: null, error }); });
    return () => { active = false; };
  }, [result.item?.owner?.id]);

  useEffect(() => {
    const category = result.item?.category?.slug;
    const currentItemId = result.item?.id;
    if (!category || !currentItemId) return undefined;
    const key = `${category}:${currentItemId}`;
    let active = true;
    apiRequest(`/items?category=${encodeURIComponent(category)}&pageSize=5`)
      .then(({ items }) => { if (active) setRelatedItems({ key, items: items.filter((item) => item.id !== currentItemId), error: null }); })
      .catch((error) => { if (active) setRelatedItems({ key, items: [], error }); });
    return () => { active = false; };
  }, [result.item?.category?.slug, result.item?.id]);

  const loading = result.key !== requestKey;
  const error = loading ? null : result.error;
  const item = loading ? null : result.item;
  if (loading) return <main className="info"><p aria-live="polite">Loading item…</p></main>;
  if (error) {
    return (
      <main className="info" role="alert">
        <div className="eyebrow">ITEM DETAILS</div><h1>We couldn’t load this listing.</h1><p>{error.message}</p>
        <button className="button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button>
        <Link className="back-link" to="/items">Back to items</Link>
      </main>
    );
  }
  if (!item) return null;

  const photos = item.photos?.filter((photo) => photo.url) ?? [];
  const minStart = item.availableFrom && item.availableFrom > todayDate ? item.availableFrom : todayDate;
  const days = dateCount(startDate, endDate);
  const datesValid = days > 0 && startDate >= minStart
    && (!item.availableUntil || endDate <= item.availableUntil)
    && (!item.availableFrom || startDate >= item.availableFrom);
  const ownListing = item.owner?.id === user?.id;

  async function requestBooking(event) {
    event.preventDefault();
    setRequestMessage(null);
    if (!datesValid) {
      setRequestMessage({ kind: 'error', text: 'Choose valid dates within this listing’s availability.' });
      return;
    }
    setRequestBusy(true);
    try {
      const booking = await apiRequest('/bookings', {
        method: 'POST',
        body: { listingId: item.id, startDate, endDate },
      });
      setRequestMessage({
        kind: 'success',
        text: 'Your request was sent. No payment or deposit is collected in this setup.',
        bookingId: booking.id,
      });
    } catch (requestError) {
      setRequestMessage({ kind: 'error', text: requestError.message });
    } finally {
      setRequestBusy(false);
    }
  }

  async function submitReport(event) {
    event.preventDefault();
    setReportBusy(true);
    setReportMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest('/reports', {
        method: 'POST',
        body: {
          listingId: item.id,
          reason: String(form.get('reason') ?? '').trim(),
          details: String(form.get('details') ?? '').trim(),
        },
      });
      setReportMessage({ kind: 'success', text: 'Your report was sent to campus support for review.' });
      setReportOpen(false);
    } catch (error) {
      setReportMessage({ kind: 'error', text: error.message });
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <main id="main" className="item-detail wrap">
      <Link className="back-link" to="/items"><ArrowLeft size={16} /> Back to the collection</Link>
      <div className="detail-grid">
        <section className="detail-gallery" aria-label={`${item.title} photos`}>
          {photos.length ? photos.map((photo) => <img src={photo.url} alt={item.title} key={photo.id} />) : (
            <div className="detail-image-empty"><span>{item.category?.name?.slice(0, 1) ?? 'L'}</span><p>No photos added yet</p></div>
          )}
        </section>
        <section className="detail-copy">
          <div className="eyebrow">{item.category?.name ?? 'CAMPUS ITEM'} · {item.condition.replace('_', ' ').toUpperCase()}</div>
          <h1>{item.title}</h1>
          <p className="detail-description">{item.description}</p>
          <div className="detail-prices">
            <div><small>Borrowing price</small><b>{money(item.pricePerDay)}<span> / day</span></b></div>
            <div><small>Refundable deposit requested</small><b>{money(item.depositAmount)}</b></div>
            <div><small>Late fee policy</small><b>{money(item.lateFeePerDay)}<span> / day</span></b></div>
          </div>
          <div className="handover"><MapPin size={17} /><span><small>Campus handover</small><b>{item.handoverLocation}</b></span></div>
          {item.rules && <section className="item-rules"><h2>Rules and instructions</h2><p>{item.rules}</p></section>}
          <div className="lender-card">
            <span className="lender-avatar">{item.owner?.fullName?.slice(0, 1) ?? 'S'}</span>
            <span><small>Listed by</small><b>{item.owner?.fullName ?? 'Campus student'}</b></span>
            <ShieldCheck size={17} />
          </div>
          {ownerReviews.userId === item.owner?.id && !ownerReviews.error && <section className="item-rules" aria-label="Lender reviews">
            <h2>Student reviews</h2>
            {ownerReviews.data.total === 0 ? <p>No reviews yet.</p> : <>
              <p><b>{ownerReviews.data.ratingAverage}/5</b> average from {ownerReviews.data.total} completed borrowing{ownerReviews.data.total === 1 ? '' : 's'}.</p>
              {ownerReviews.data.reviews.map((review) => <p key={review.id}><b>{review.rating}/5 · {review.reviewer?.fullName ?? 'Campus student'}</b>{review.body ? ` — ${review.body}` : ''}</p>)}
            </>}
          </section>}
          {!ownListing && <section className="listing-report">
            {reportMessage && <div className={`form-alert ${reportMessage.kind}`} role="status">{reportMessage.text}</div>}
            {!reportOpen ? <button className="text-button" type="button" onClick={() => setReportOpen(true)}>Report this listing</button>
              : <form className="dispute-form" onSubmit={submitReport}>
                <h2>Report this listing</h2>
                <label className="form-field">Reason<input name="reason" required minLength={2} maxLength={120} placeholder="For example, inaccurate description" /></label>
                <label className="form-field">What should campus support know?<textarea name="details" required minLength={10} maxLength={4000} rows="4" placeholder="Describe the concern. Reports are shared with campus administrators." /></label>
                <div className="booking-actions"><button className="button" disabled={reportBusy}>{reportBusy ? 'Sending…' : 'Send report'}</button><button type="button" className="outline-button" onClick={() => setReportOpen(false)}>Cancel</button></div>
              </form>}
          </section>}
          {ownListing ? <div className="booking-notice"><b>This is your listing.</b><p>Students from your campus can request it from the collection.</p><Link to={`/my-listings/${item.id}/edit`}>Edit your listing →</Link></div>
            : item.status !== 'approved' ? <div className="booking-notice"><b>Not available for booking.</b><p>This listing is not currently open for requests.</p></div>
              : (
                <form className="booking-request" onSubmit={requestBooking}>
                  <div><h2>Request to borrow</h2><p>Choose your dates. The lender will review the request.</p></div>
                  <div className="booking-date-fields">
                    <label className="form-field">Start date<input type="date" required min={minStart} max={item.availableUntil ?? undefined} value={startDate} onChange={(event) => {
                      setStartDate(event.target.value);
                      if (endDate && event.target.value > endDate) setEndDate(event.target.value);
                    }} /></label>
                    <label className="form-field">End date<input type="date" required min={startDate || minStart} max={item.availableUntil ?? undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
                  </div>
                  <div className="booking-estimate">
                    <span>{days || '—'} {days === 1 ? 'day' : 'days'} · Borrowing total <b>{days ? money(item.pricePerDay * days) : 'Choose dates'}</b></span>
                    <small>Refundable deposit requested: {money(item.depositAmount)}. It is not collected or held by Lendly.</small>
                  </div>
                  {requestMessage && <div className={`form-alert ${requestMessage.kind}`} role="status">
                    {requestMessage.text}{requestMessage.bookingId && <p><Link to="/bookings">View your request →</Link></p>}
                  </div>}
                  <button className="button form-submit" disabled={!datesValid || requestBusy || Boolean(requestMessage?.bookingId)}>
                    {requestBusy ? 'Sending request…' : requestMessage?.bookingId ? 'Request sent' : 'Send borrowing request'}
                  </button>
                  <p className="booking-payment-note">No payment is processed. Review the full terms with the lender before handover.</p>
                </form>
              )}
        </section>
      </div>
      {relatedItems.key === `${item.category?.slug}:${item.id}` && !relatedItems.error && relatedItems.items.length > 0 && <section className="categories related-items">
        <div className="section-heading"><div><div className="eyebrow">MORE FROM THIS CATEGORY</div><h2>Related campus items</h2></div><Link to={`/items?category=${encodeURIComponent(item.category.slug)}`}>Browse category →</Link></div>
        <div className="listing-grid">{relatedItems.items.map((related) => <ListingCard key={related.id} item={related} />)}</div>
      </section>}
    </main>
  );
}
