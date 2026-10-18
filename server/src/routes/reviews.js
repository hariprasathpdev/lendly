import { Router } from 'express';
import { requireAuth, requireVerifiedEmail, requireProfile, requireTermsAccepted } from '../middleware/auth.js';
import { createReview, listUserReviews } from '../controllers/reviews.js';

const router = Router();
router.use(requireAuth, requireVerifiedEmail, requireProfile, requireTermsAccepted);
router.post('/', createReview);
router.get('/users/:userId', listUserReviews);

export default router;
