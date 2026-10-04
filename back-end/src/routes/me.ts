import { Router } from 'express';
import { verifyToken } from '../middleware/verifyToken.ts';
import {
  getProfile,
  updateProfile,
  changePassword,
  addVehicle,
  listVehicles,
  getVehicle,
  updateVehicle,
  deleteVehicle,
  addPaymentMethod,
  listPaymentMethods,
  deletePaymentMethod
} from '../controllers/meController.ts';

const router = Router();

// All routes in this file are for the authenticated user
router.use(verifyToken);

// Profile
router.get('/', getProfile);
router.patch('/', updateProfile);
router.post('/change-password', changePassword);

// Vehicles
router.get('/vehicles', listVehicles);
router.post('/vehicles', addVehicle);
router.get('/vehicles/:id', getVehicle);
router.patch('/vehicles/:id', updateVehicle);
router.delete('/vehicles/:id', deleteVehicle);

// Payment Methods
router.get('/payment-methods', listPaymentMethods);
router.post('/payment-methods', addPaymentMethod);
router.delete('/payment-methods/:id', deletePaymentMethod);

export default router;