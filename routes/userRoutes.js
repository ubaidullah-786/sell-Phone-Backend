const express = require('express');
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');
const upload = require('../utils/multerConfig.js');

const router = express.Router();

// Public routes
router.post('/signup', upload.single('photo'), authController.signup);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.patch('/reset-password/:token', authController.resetPassword);

// Email change verification (public route)
router.get('/verify-email-change/:token', userController.verifyEmailChange);

// Protected routes
router.use(authController.protect); // All routes after this middleware are protected

router.patch('/update-my-password', authController.updatePassword);
router.patch('/update-me', upload.single('photo'), userController.updateMe);
router.patch('/cancel-email-change', userController.cancelEmailChange);
router.delete('/delete-me', userController.deleteMe);

module.exports = router;
