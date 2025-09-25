// routes/favoriteRoutes.js
const express = require('express');
const favCtrl = require('../controllers/favoriteController');
const authController = require('../controllers/authController');
const router = express.Router();

router.use(authController.protect);

router.post('/:adId', favCtrl.addFavorite);
router.delete('/:adId', favCtrl.removeFavorite);
router.get('/', favCtrl.getUserFavorites);

module.exports = router;
