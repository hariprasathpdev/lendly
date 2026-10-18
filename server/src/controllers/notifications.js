import { adminClient } from '../config/supabase.js';
import { asyncHandler } from '../utils/async-handler.js';

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function requireDb(next) {
  if (adminClient) return true;
  next(fail(503, 'DATABASE_UNCONFIGURED', 'Campus data services are not configured yet.'));
  return false;
}

export const listNotifications = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const { data, error } = await adminClient.from('notifications')
    .select('id,type,title,body,related_type,related_id,read_at,created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return next(fail(503, 'NOTIFICATION_SERVICE_UNAVAILABLE', 'Notifications could not be loaded.'));
  res.json({ data: { notifications: data ?? [] } });
});

export const markNotificationRead = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const { data, error } = await adminClient.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id,read_at')
    .maybeSingle();
  if (error) return next(fail(503, 'NOTIFICATION_SERVICE_UNAVAILABLE', 'The notification could not be updated.'));
  if (!data) return next(fail(404, 'NOTIFICATION_NOT_FOUND', 'The notification was not found.'));
  res.json({ data: { id: data.id, readAt: data.read_at } });
});

export const markAllNotificationsRead = asyncHandler(async (req, res, next) => {
  if (!requireDb(next)) return;
  const { error } = await adminClient.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', req.user.id)
    .is('read_at', null);
  if (error) return next(fail(503, 'NOTIFICATION_SERVICE_UNAVAILABLE', 'Notifications could not be updated.'));
  res.json({ data: { updated: true } });
});
