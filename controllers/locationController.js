const Location = require('../models/locationModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// GET /locations/cities
exports.getAllCities = catchAsync(async (req, res, next) => {
  const cities = await Location.find().select('city -_id');

  res.status(200).json({
    status: 'success',
    results: cities.length,
    data: cities.map(c => c.city),
  });
});

// GET /locations/cities/:city/towns
exports.getTownsByCity = catchAsync(async (req, res, next) => {
  const { city } = req.params;

  const location = await Location.findOne({
    city: { $regex: new RegExp(`^${city}$`, 'i') }, // case-insensitive
  });

  if (!location) {
    return next(new AppError(`No towns found for city ${city}`, 404));
  }

  // Flatten groups into single array of towns
  const towns = Object.values(location.groups).flat();

  res.status(200).json({
    status: 'success',
    city: location.city,
    results: towns.length,
    data: towns,
  });
});
