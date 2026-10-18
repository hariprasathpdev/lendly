import { Router } from 'express';
import { requireAuth, requireVerifiedEmail, requireProfile, requireTermsAccepted } from '../middleware/auth.js';
import { listConversationMessages, listConversations, sendConversationMessage } from '../controllers/conversations.js';

const router = Router();
router.use(requireAuth, requireVerifiedEmail, requireProfile, requireTermsAccepted);
router.get('/mine', listConversations);
router.get('/:id/messages', listConversationMessages);
router.post('/:id/messages', sendConversationMessage);

export default router;
