const Ad = require('../models/adModel.js');
const catchAsync = require('../utils/catchAsync.js');
const AppError = require('../utils/appError.js');

exports.createAd = catchAsync(async (req, res, next) => {
  if (!req.files || req.files.length === 0)
    return next(new AppError('Please upload at least one image', 400));

  if (req.files.length > 5)
    return next(new AppError('You can upload a maximum of 5 images', 400));

  const images = req.files.map(file => file.filename);

  const ad = await Ad.create({
    ...req.body,
    images,
    user: req.user.id,
  });

  res.status(201).json({
    status: 'success',
    data: ad,
  });
});

exports.getAds = catchAsync(async (req, res, next) => {
  const queryObj = {};
  // Price filter
  if (req.query.minPrice || req.query.maxPrice) {
    queryObj.price = {};
    if (req.query.minPrice) queryObj.price.$gte = req.query.minPrice;
    if (req.query.maxPrice) queryObj.price.$lte = req.query.maxPrice;
  }
  console.log(queryObj);
  const ads = await Ad.find(queryObj)
    .populate('user', 'name email')
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: ads.length,
    data: ads,
  });
});

exports.getAd = catchAsync(async (req, res, next) => {
  const ad = await Ad.findById(req.params.id).populate('user', 'name email');

  if (!ad) return next(new AppError('No ad found with that ID', 404));

  res.status(200).json({
    status: 'success',
    data: ad,
  });
});

exports.updateAd = catchAsync(async (req, res, next) => {
  req.body = req.body || {};

  const ad = await Ad.findById(req.params.id);

  if (!ad) {
    return next(new AppError('No ad found with that ID', 404));
  }

  if (ad.user.toString() !== req.user.id) {
    return next(
      new AppError('You do not have permission to update this ad', 403),
    );
  }

  // Update text fields
  const allowedFields = [
    'title',
    'description',
    'price',
    'condition',
    'brand',
    'model',
    'city',
    'town',
  ];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      ad[field] = req.body[field];
    }
  });

  // ---- Replace images every time ----
  if (req.files && req.files.length > 0) {
    if (req.files.length > 5) {
      return next(new AppError('You can upload a maximum of 5 images', 400));
    }

    ad.images = req.files.map(file => file.filename);
  }

  await ad.save();

  res.status(200).json({
    status: 'success',
    data: { ad },
  });
});

exports.deleteAd = catchAsync(async (req, res, next) => {
  const ad = await Ad.findById(req.params.id);

  if (!ad) {
    return next(new AppError('No ad found with that ID', 404));
  }

  // Check ownership
  if (ad.user.toString() !== req.user.id) {
    return next(
      new AppError('You do not have permission to delete this ad', 403),
    );
  }

  await Ad.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.toggleAdStatus = catchAsync(async (req, res, next) => {
  const ad = await Ad.findById(req.params.id);

  if (!ad) return next(new AppError('No ad found with that ID', 404));
  if (ad.user.toString() !== req.user.id) {
    return next(new AppError('You are not allowed to update this ad', 403));
  }

  // If expired, cannot reactivate
  if (ad.isExpired) {
    ad.isActive = false;
    await ad.save();
    return next(
      new AppError('Ad has expired and cannot be activated again', 400),
    );
  }

  ad.isActive = !ad.isActive;
  await ad.save();

  res.status(200).json({
    status: 'success',
    data: { ad },
  });
});
