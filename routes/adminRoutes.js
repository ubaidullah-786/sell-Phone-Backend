const express = require('express');
const adminController = require('../controllers/adminController');
const authController = require('../controllers/authController');

const router = express.Router();

// All admin routes are protected and restricted to admin role
router.use(authController.protect);
router.use(authController.restrictTo('admin'));

// Dashboard statistics
router.get('/stats/dashboard', adminController.getDashboardStats);
router.get('/stats/users', adminController.getUserStats);
router.get('/stats/ads', adminController.getAdStats);
router.get('/stats/chats', adminController.getChatStats);

// User management
router.get('/users', adminController.getAllUsers);
router.delete('/users/:id', adminController.deleteUser);

// Ad management
router.get('/ads', adminController.getAllAds);
router.delete('/ads/:id', adminController.deleteAd);
router.patch('/ads/:id/status', adminController.updateAdStatus);

module.exports = router;
