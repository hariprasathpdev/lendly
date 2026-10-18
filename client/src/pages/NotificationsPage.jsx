import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../services/api.js';

function targetFor(notification) {
  if (notification.related_type === 'booking') return '/bookings';
  if (notification.related_type === 'conversation' && notification.related_id) return `/messages/${notification.related_id}`;
  if (notification.related_type === 'listing' && notification.related_id) return `/items/${notification.related_id}`;
  return '/dashboard';
}

export default function NotificationsPage() {
  const [refreshCount, setRefreshCount] = useState(0);
  const [result, setResult] = useState({ key: null, notifications: [], error: null });
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const requestKey = String(refreshCount);

  useEffect(() => {
    let active = true;
    apiRequest('/notifications/mine')
      .then(({ notifications }) => {
        if (active) setResult({ key: requestKey, notifications, error: null });
      })
      .catch((error) => {
        if (active) setResult({ key: requestKey, notifications: [], error });
      });
    return () => { active = false; };
  }, [requestKey]);

  const loading = result.key !== requestKey;
  const unreadCount = result.notifications.filter((notification) => !notification.read_at).length;

  async function markRead(notification) {
    if (notification.read_at) return;
    setBusyId(notification.id);
    try {
      const updated = await apiRequest(`/notifications/${notification.id}/read`, { method: 'PATCH' });
      setResult((current) => ({
        ...current,
        notifications: current.notifications.map((item) => item.id === notification.id ? { ...item, read_at: updated.readAt } : item),
      }));
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    setBusyId('all');
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      setRefreshCount((count) => count + 1);
      setNotice('All notifications marked as read.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main id="main" className="marketplace-page wrap">
      <div className="marketplace-heading">
        <div><div className="eyebrow">CAMPUS UPDATES</div><h1>Notifications</h1><p>Booking activity and account updates for your campus.</p></div>
        {unreadCount > 0 && <button className="outline-button" disabled={busyId === 'all'} onClick={markAllRead}>{busyId === 'all' ? 'Updating…' : 'Mark all as read'}</button>}
      </div>
      {notice && <div className="form-alert" role="status">{notice}</div>}
      {loading ? <div className="state-panel" aria-live="polite">Loading notifications…</div>
        : result.error ? <section className="state-panel error" role="alert"><b>We couldn’t load notifications.</b><p>{result.error.message}</p><button className="outline-button" onClick={() => setRefreshCount((count) => count + 1)}>Try again</button></section>
          : result.notifications.length === 0 ? <section className="state-panel"><div className="empty-mark">◌</div><h2>You’re all caught up.</h2><p>Booking and account updates will appear here.</p><Link className="button" to="/items">Browse items</Link></section>
            : <div className="notification-list">{result.notifications.map((notification) => <article className={notification.read_at ? 'notification-card read' : 'notification-card unread'} key={notification.id}>
              <div className="notification-copy"><div className="notification-title-row"><h2>{notification.title}</h2>{!notification.read_at && <span className="unread-dot" aria-label="Unread" />}</div>
                <p>{notification.body}</p><small>{new Date(notification.created_at).toLocaleString()}</small></div>
              <div className="notification-actions">
                {!notification.read_at && <button className="text-button" disabled={busyId === notification.id} onClick={() => markRead(notification)}>{busyId === notification.id ? 'Updating…' : 'Mark read'}</button>}
                <Link className="outline-button" to={targetFor(notification)} onClick={() => markRead(notification)}>Open</Link>
              </div>
            </article>)}</div>}
    </main>
  );
}
