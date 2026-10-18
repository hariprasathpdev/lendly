import { Router } from 'express';
import { runOverdueCheck } from '../controllers/overdue.js';
import { requireCronSecret } from '../middleware/cron-auth.js';

const router = Router();
router.post('/overdue/run', requireCronSecret, runOverdueCheck);

export default router;
