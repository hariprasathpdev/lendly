import { Router } from 'express';
import { requireAuth,requireVerifiedEmail,requireProfile,requireTermsAccepted } from '../middleware/auth.js';
import { listItems,myItems,getItem,createItem,updateItem,changeItemStatus,photoUploadMiddleware,uploadItemPhotos,deleteItemPhoto } from '../controllers/items.js';
const router=Router();router.use(requireAuth,requireVerifiedEmail,requireProfile,requireTermsAccepted);
router.get('/mine',myItems);router.get('/',listItems);router.post('/',createItem);router.get('/:id',getItem);router.patch('/:id',updateItem);router.patch('/:id/status',changeItemStatus);router.post('/:id/photos',photoUploadMiddleware,uploadItemPhotos);router.delete('/:id/photos/:photoId',deleteItemPhoto);
export default router;

