import { Router } from 'express';
const router=Router();
router.get('/',(_req,res)=>res.json({data:{status:'ok',service:'lendly-api',timestamp:new Date().toISOString()}}));
export default router;
