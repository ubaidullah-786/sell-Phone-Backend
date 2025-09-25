const Phone = require('../models/phoneModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

exports.getBrands = catchAsync(async (req, res, next) => {
  const brands = await Phone.find({}, { brand: 1, _id: 0 });

  if (!brands || brands.length === 0) {
    return next(new AppError('No brands found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: brands.map(b => b.brand), // Just list of brand names
  });
});

exports.getModelsByBrand = catchAsync(async (req, res, next) => {
  const { brand } = req.params;

  const brandData = await Phone.findOne(
    { brand: new RegExp('^' + brand + '$', 'i') }, // case-insensitive match
    { models: 1, brand: 1, _id: 0 },
  );

  if (!brandData) {
    return next(new AppError('Brand not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: brandData,
  });
});
