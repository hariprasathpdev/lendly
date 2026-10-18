import { Router } from 'express';
import { requireAuth, requireVerifiedEmail, requireProfile, requireTermsAccepted } from '../middleware/auth.js';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../controllers/notifications.js';

const router = Router();
router.use(requireAuth, requireVerifiedEmail, requireProfile, requireTermsAccepted);
router.get('/mine', listNotifications);
router.post('/read-all', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);

export default router;
