import { Router } from 'express';
import { requireAuth, requireVerifiedEmail, requireProfile, requireTermsAccepted } from '../middleware/auth.js';
import { createBooking, getBookingDetails, listBookings, updateBookingAction } from '../controllers/bookings.js';

const router = Router();
router.use(requireAuth, requireVerifiedEmail, requireProfile, requireTermsAccepted);
router.get('/mine', listBookings);
router.post('/', createBooking);
router.get('/:id', getBookingDetails);
router.patch('/:id/action', updateBookingAction);

export default router;
