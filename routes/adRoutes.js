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

router
  .route('/:id')
  .get(adController.getAd)
  .patch(authController.protect, upload.array('image'), adController.updateAd)
  .delete(authController.protect, adController.deleteAd);

module.exports = router;
