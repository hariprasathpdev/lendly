import { Router } from 'express';
import { requireAuth, requireVerifiedEmail, requireProfile, requireTermsAccepted, requireAdmin } from '../middleware/auth.js';
import { listDisputes, listModerationQueue, listReports, resolveDispute, reviewListing, reviewReport } from '../controllers/admin.js';
import { listRefundRequests, reviewRefund } from '../controllers/payments.js';
import { getOverdueDashboard, reviewLateFee } from '../controllers/overdue.js';

const router = Router();
router.use(requireAuth, requireVerifiedEmail, requireProfile, requireTermsAccepted, requireAdmin);
router.get('/access-check', (req, res) => res.json({ data: { authorized: true, userId: req.user.id } }));
router.get('/listings', listModerationQueue);
router.patch('/listings/:id/review', reviewListing);
router.get('/disputes', listDisputes);
router.patch('/disputes/:id/review', resolveDispute);
router.get('/refunds', listRefundRequests);
router.patch('/refunds/:id/review', reviewRefund);
router.get('/reports', listReports);
router.patch('/reports/:id/review', reviewReport);
router.get('/overdue', getOverdueDashboard);
router.patch('/late-fees/:id/review', reviewLateFee);

export default router;
