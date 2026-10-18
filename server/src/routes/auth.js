import { Router } from 'express';import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';import { isAllowedCollegeEmail } from '../utils/email-domain.js';import { emailSchema } from '../validators/auth.js';
const router=Router();const emailLimiter=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:'draft-7',legacyHeaders:false});
router.get('/policy',(_req,res)=>res.json({data:{allowedEmailDomains:env.allowedEmailDomains,emailVerificationRequired:true,realPaymentsEnabled:false}}));
router.post('/validate-email',emailLimiter,(req,res)=>{const parsed=emailSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:parsed.error.issues[0]?.message??'Enter a valid college email.'}});if(!isAllowedCollegeEmail(parsed.data.email))return res.status(400).json({error:{code:'COLLEGE_DOMAIN_REQUIRED',message:`Use an email ending in ${env.allowedEmailDomains.map(x=>`@${x}`).join(' or ')}.`}});res.json({data:{allowed:true}})});
export default router;
