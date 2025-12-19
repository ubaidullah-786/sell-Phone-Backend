const mongoose = require('mongoose');
const Ad = require('../models/adModel.js');
const User = require('../models/userModel.js');
const catchAsync = require('../utils/catchAsync.js');
const AppError = require('../utils/appError.js');
const Favorite = require('../models/favoriteModel');
const { generateSeoMetadata } = require('../utils/aiSeoService.js');
const path = require('path');
const fs = require('fs');

exports.createAd = catchAsync(async (req, res, next) => {
  if (!req.files || req.files.length === 0)
    return next(new AppError('Please upload at least one image', 400));

  if (req.files.length > 10)
    return next(new AppError('You can upload a maximum of 10 images', 400));

  const images = req.files.map(file => file.filename);

  // Generate AI-enhanced SEO metadata (non-blocking)
  const adData = { ...req.body, images };
  let seoMetadata = {};

  try {
    seoMetadata = await generateSeoMetadata(adData);
  } catch (err) {
    console.error('SEO generation failed, using defaults:', err.message);
  }

  const ad = await Ad.create({
    ...req.body,
    ...seoMetadata,
    images,
    user: req.user.id,
  });

  res.status(201).json({
    status: 'success',
    data: ad,
  });
});

exports.getAds = catchAsync(async (req, res, next) => {
  const now = new Date();
  const queryObj = {
    isActive: true,
    expiresAt: { $gt: now },
  };

  if (req.query.search) {
    const keywords = req.query.search.trim().split(/\s+/);
    queryObj.$and = keywords.map(word => ({
      $or: [
        { brand: { $regex: word, $options: 'i' } },
        { model: { $regex: word, $options: 'i' } },
        { title: { $regex: word, $options: 'i' } },
      ],
    }));
  }

  if (req.query.brand) queryObj.brand = req.query.brand;
  if (req.query.model) queryObj.model = req.query.model;
  if (req.query.city) queryObj.city = req.query.city;
  if (req.query.town) queryObj.town = req.query.town;

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

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;

  const ads = await Ad.find(queryObj)
    .select(
      'title price condition model city town images isFeatured createdAt user slug',
    )
    .populate('user', 'name')
    .sort({ isFeatured: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const transformed = ads.map(a => ({
    _id: a._id,
    slug: a.slug,
    title: a.title,
    price: a.price,
    model: a.model,
    city: a.city,
    town: a.town,
    condition: a.condition,
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
  const idOrSlug = req.params.id;
  let ad;

  // Check if it's a valid MongoDB ObjectId (24 hex characters)
  if (
    mongoose.Types.ObjectId.isValid(idOrSlug) &&
    /^[0-9a-fA-F]{24}$/.test(idOrSlug)
  ) {
    // Fetch by ID
    ad = await Ad.findById(idOrSlug).populate('user', 'name email');
  } else {
    // Treat as slug - find by slug
    ad = await Ad.findOne({ slug: idOrSlug.toLowerCase() }).populate(
      'user',
      'name email',
    );
  }

  if (!ad) return next(new AppError('No ad found with that ID', 404));

  await ad.ensureActiveStatus();
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

  // --- NEW: attach owner's photo if present (look up by email) ---
  // Only attempt lookup if we have an email from populated user
  if (ad.user && ad.user.email) {
    // select common possible photo fields so this works with varied user schemas
    const ownerDoc = await User.findOne({ email: ad.user.email })
      .select('photo')
      .lean();

    if (ownerDoc) {
      const ownerPhoto = ownerDoc.photo;

      if (ownerPhoto) {
        payload.ownerPhoto = ownerPhoto;
      }
    }
  }

  res.status(200).json({
    status: 'success',
    data: payload,
  });
});

exports.getMyAds = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  const ads = await Ad.aggregate([
    {
      $match: { user: mongoose.Types.ObjectId.createFromHexString(userId) },
    },
    {
      $lookup: {
        from: 'favorites', // collection name for favorites
        localField: '_id', // Ad._id
        foreignField: 'ad', // Favorite.ad
        as: 'favorites',
      },
    },
    {
      $addFields: {
        savesCount: { $size: '$favorites' },
      },
    },
    // {
    //   $project: {
    //     favorites: 0, // exclude raw favorites array
    //   },
    // },
    { $sort: { createdAt: -1 } },
  ]);

  const transformed = ads.map(a => ({
    _id: a._id,
    title: a.title,
    price: a.price,
    brand: a.brand,
    model: a.model,
    city: a.city,
    town: a.town,
    condition: a.condition,
    isFeatured: !!a.isFeatured,
    isActive: a.isActive,
    expiresAt: a.expiresAt,
    createdAt: a.createdAt,
    thumbnail: Array.isArray(a.images) && a.images.length ? a.images[0] : null,
    user: a.user ? { _id: a.user._id, name: a.user.name } : null,
    savesCount: a.savesCount,
  }));

  res.status(200).json({
    status: 'success',
    results: ads.length,
    data: transformed,
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
  })
    .populate('user', 'name photo')
    .sort('-createdAt');

  const transformedAds = ads.map(ad => {
    const adObj = ad.toObject();
    return {
      ...adObj,
      thumbnail:
        Array.isArray(adObj.images) && adObj.images.length
          ? adObj.images[0]
          : null,
    };
  });

  res.status(200).json({
    status: 'success',
    results: transformedAds.length,
    data: transformedAds,
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
    if (req.files.length > 10) {
      return next(new AppError('You can upload a maximum of 10 images', 400));
    }

    // Delete old images from disk
    if (ad.images && ad.images.length > 0) {
      ad.images.forEach(img => {
        const oldPath = path.join(
          __dirname,
          '..',
          'public',
          'uploads',
          'ads',
          img,
        );
        if (fs.existsSync(oldPath)) {
          fs.unlink(oldPath, err => {
            if (err)
              console.error(`Failed to delete old ad image: ${img}`, err);
          });
        }
      });
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

  if (ad.user.toString() !== req.user.id) {
    return next(
      new AppError('You do not have permission to delete this ad', 403),
    );
  }

  // Delete ad images from disk before removing the document
  if (ad.images && ad.images.length > 0) {
    ad.images.forEach(img => {
      const imgPath = path.join(
        __dirname,
        '..',
        'public',
        'uploads',
        'ads',
        img,
      );
      if (fs.existsSync(imgPath)) {
        try {
          fs.unlinkSync(imgPath);
        } catch (e) {
          console.error(`Failed to delete ad image ${img}:`, e?.message || e);
        }
      }
    });
  }

  await Ad.findByIdAndDelete(req.params.id);

  // Delete all favorites pointing to this ad
  await Favorite.deleteMany({ ad: req.params.id });

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
