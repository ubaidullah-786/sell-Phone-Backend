const express = require('express');
const favoriteController = require('../controllers/favoriteController');
const authController = require('../controllers/authController');
const router = express.Router();

router.use(authController.protect); // all favorite routes protected

router.get('/', favoriteController.getUserFavorites);
router
  .route('/:adId')
  .post(favoriteController.addFavorite)
  .delete(favoriteController.removeFavorite);

module.exports = router;
