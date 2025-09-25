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
  // build filter from query (price, brand, model, city, town)
  const filter = {};
  if (req.query.brand) filter.brand = req.query.brand;
  if (req.query.model) filter.model = req.query.model;
  if (req.query.city) filter.city = req.query.city;
  if (req.query.town) filter.town = req.query.town;

  // price range
  if (req.query.minPrice || req.query.maxPrice) {
    filter.price = {};
    if (req.query.minPrice) filter.price.$gte = Number(req.query.minPrice);
    if (req.query.maxPrice) filter.price.$lte = Number(req.query.maxPrice);
  }

  // pagination options
  const limit = Math.min(parseInt(req.query.limit || 20), 100);
  const page = Math.max(parseInt(req.query.page || 1), 1);
  const skip = (page - 1) * limit;

  const ads = await Ad.getPublicList(filter, { limit, skip });

  // Lightweight transform: keep only first image as thumbnail
  const transformed = ads.map(a => ({
    _id: a._id,
    title: a.title,
    price: a.price,
    brand: a.brand,
    model: a.model,
    city: a.city,
    town: a.town,
    isFeatured: a.isFeatured,
    createdAt: a.createdAt,
    thumbnail: Array.isArray(a.images) && a.images.length ? a.images[0] : null,
    user: a.user, // may be ObjectId only unless populated
  }));

  res.status(200).json({
    status: 'success',
    results: transformed.length,
    data: transformed,
  });
});

exports.getAd = catchAsync(async (req, res, next) => {
  const adId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(adId))
    return next(new AppError('Invalid ad id', 400));

  // requester id if token present
  const requesterId = req.user ? req.user.id : null;

  const result = await Ad.getByIdForUser(adId, requesterId);

  if (!result) return next(new AppError('Ad not found', 404));
  if (result.notAccessible) return next(new AppError('Ad not available', 404));

  let { ad } = result;

  // If owner and savesCount null (model didn't compute), compute now
  if (
    requesterId &&
    ad.user &&
    ad.user._id.toString() === requesterId.toString()
  ) {
    if (ad.savesCount === null || ad.savesCount === undefined) {
      const count = await Favorite.countDocuments({ ad: ad._id });
      ad.savesCount = count;
    }
  }

  res.status(200).json({
    status: 'success',
    data: ad,
  });
});

exports.getMyAds = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const ads = await Ad.getMyAdsWithSaves(userId);

  // Optionally map thumbnail
  const mapped = ads.map(a => ({
    ...a,
    thumbnail: Array.isArray(a.images) && a.images.length ? a.images[0] : null,
  }));

  res.status(200).json({
    status: 'success',
    results: mapped.length,
    data: mapped,
  });
});

exports.getAdsByUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId))
    return next(new AppError('Invalid user id', 400));

  const filter = { user: mongoose.Types.ObjectId(userId) };
  const ads = await Ad.getPublicList(filter, {
    limit: parseInt(req.query.limit || 50),
  });

  const transformed = ads.map(a => ({
    _id: a._id,
    title: a.title,
    price: a.price,
    brand: a.brand,
    model: a.model,
    city: a.city,
    town: a.town,
    isFeatured: a.isFeatured,
    createdAt: a.createdAt,
    thumbnail: Array.isArray(a.images) && a.images.length ? a.images[0] : null,
  }));

  res.status(200).json({
    status: 'success',
    results: transformed.length,
    data: transformed,
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
