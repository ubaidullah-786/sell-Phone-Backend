const express = require('express');
const phoneController = require('../controllers/phoneController');
const router = express.Router();

// Get all brands
router.get('/brands', phoneController.getBrands);

// Get models of a specific brand
router.get('/brands/:brand/models', phoneController.getModelsByBrand);

module.exports = router;
