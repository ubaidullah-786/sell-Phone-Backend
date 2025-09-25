const mongoose = require('mongoose');
const Ad = require('../models/adModel.js');
const catchAsync = require('../utils/catchAsync.js');
const AppError = require('../utils/appError.js');
const Favorite = require('../models/favoriteModel');

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
  // base: only active and not expired
  const now = new Date();
  const queryObj = {
    isActive: true,
    expiresAt: { $gt: now },
  };

  // optional filters
  if (req.query.brand) queryObj.brand = req.query.brand;
  if (req.query.model) queryObj.model = req.query.model;
  if (req.query.city) queryObj.city = req.query.city;
  if (req.query.town) queryObj.town = req.query.town;

  // price filter (safely parse numbers)
  const min = req.query.minPrice ? Number(req.query.minPrice) : null;
  const max = req.query.maxPrice ? Number(req.query.maxPrice) : null;
  if (
    (min !== null && !Number.isNaN(min)) ||
    (max !== null && !Number.isNaN(max))
  ) {
    queryObj.price = {};
    if (min !== null && !Number.isNaN(min)) queryObj.price.$gte = min;
    if (max !== null && !Number.isNaN(max)) queryObj.price.$lte = max;
  }

  // pagination (defaults)
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;

  // select only fields needed for ad cards
  const ads = await Ad.find(queryObj)
    .select(
      'title price brand model city town images isFeatured createdAt user',
    )
    .populate('user', 'name') // only bring name (no email) to keep payload small
    .sort({ isFeatured: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // transform to thin DTO for frontend ad cards
  const transformed = ads.map(a => ({
    _id: a._id,
    title: a.title,
    price: a.price,
    brand: a.brand,
    model: a.model,
    city: a.city,
    town: a.town,
    isFeatured: !!a.isFeatured,
    createdAt: a.createdAt,
    thumbnail: Array.isArray(a.images) && a.images.length ? a.images[0] : null,
    user: a.user ? { _id: a.user._id, name: a.user.name } : null,
  }));

  res.status(200).json({
    status: 'success',
    page,
    results: transformed.length,
    data: transformed,
  });
});

exports.getAd = catchAsync(async (req, res, next) => {
  const adId = req.params.id;

  if (!mongoose.Types.ObjectId.isValid(adId)) {
    return next(new AppError('Invalid ad id', 400));
  }

  // fetch full ad with owner info
  const ad = await Ad.findById(adId).populate('user', 'name email');

  if (!ad) return next(new AppError('No ad found with that ID', 404));

  const now = new Date();
  const expired = ad.expiresAt && new Date(ad.expiresAt) <= now;
  const activeAndNotExpired = ad.isActive && !expired;

  // If ad is not active or expired, only owner can view it
  if (!activeAndNotExpired) {
    // require req.user and ownership
    if (!req.user || !ad.user || ad.user._id.toString() !== req.user.id) {
      return next(new AppError('Ad not available', 404));
    }
  }

  // Prepare response payload (full ad)
  const payload = ad.toObject();

  // If requester is owner, add savesCount
  if (req.user && ad.user && ad.user._id.toString() === req.user.id) {
    const savesCount = await Favorite.countDocuments({ ad: ad._id });
    payload.savesCount = savesCount;
  }

  res.status(200).json({
    status: 'success',
    data: payload,
  });
});

exports.getMyAds = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  // return all ads created by this user (including active/inactive/expired)
  const ads = await Ad.find({ user: userId }).sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: ads.length,
    data: ads,
  });
});

exports.getAdsByUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  // public view: only show ads that are isActive === true and not expired
  // we check expiresAt > now AND isActive true
  const now = new Date();
  const ads = await Ad.find({
    user: userId,
    isActive: true,
    expiresAt: { $gt: now },
  }).sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: ads.length,
    data: ads,
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
