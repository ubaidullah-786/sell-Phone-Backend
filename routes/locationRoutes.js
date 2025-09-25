const express = require('express');
const locationController = require('../controllers/locationController');

const router = express.Router();

// All cities
router.get('/cities', locationController.getAllCities);

// Towns by city
router.get('/cities/:city/towns', locationController.getTownsByCity);

module.exports = router;
