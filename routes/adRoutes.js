const express = require('express');
const adController = require('../controllers/adController.js');
const authController = require('../controllers/authController.js');
const upload = require('../utils/multerConfig.js');

const router = express.Router();

router.get('/my-ads', authController.protect, adController.getMyAds);
router.get('/user/:userId', adController.getAdsByUser);

// ad detail & actions
router
  .route('/:id')
  .get(adController.getAd) // public, but getByIdForUser checks owner if token set
  .patch(
    authController.protect,
    upload.array('images', 5),
    adController.updateAd,
  )
  .delete(authController.protect, adController.deleteAd);

router.get('/', adController.getAds);

router.patch(
  '/:id/toggle-status',
  authController.protect,
  adController.toggleAdStatus,
);

module.exports = router;
