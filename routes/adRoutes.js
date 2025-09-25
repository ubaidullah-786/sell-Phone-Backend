const express = require('express');
const adController = require('../controllers/adController.js');
const authController = require('../controllers/authController.js');
const upload = require('../utils/multerConfig.js');

const router = express.Router();

router.route('/').get(adController.getAds).post(
  authController.protect,
  upload.array('image'), // max 5 images per ad
  adController.createAd,
);

router.get('/my-ads', authController.protect, adController.getMyAds);

router.get('/user/:userId', adController.getAdsByUser);

router
  .route('/:id')
  .get(adController.getAd)
  .patch(authController.protect, upload.array('image'), adController.updateAd)
  .delete(authController.protect, adController.deleteAd);

router.patch(
  '/:id/toggle-status',
  authController.protect,
  adController.toggleAdStatus,
);

module.exports = router;
