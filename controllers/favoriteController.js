// controllers/favoriteController.js
const Favorite = require('../models/favoriteModel');
const Ad = require('../models/adModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

exports.addFavorite = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const adId = req.params.adId;

  const ad = await Ad.findById(adId);
  if (!ad) return next(new AppError('Ad not found', 404));

  // Only active and not expired ads can be saved
  const now = new Date();
  if (!ad.isActive || (ad.expiresAt && ad.expiresAt <= now)) {
    return next(new AppError('Only active ads can be saved', 400));
  }

  // create favorite (unique index prevents duplicates)
  try {
    const fav = await Favorite.create({ user: userId, ad: adId });
    // increment savesCount for performance
    await Ad.findByIdAndUpdate(
      adId,
      { $inc: { savesCount: 1 } },
      { new: true },
    );
    res.status(201).json({ status: 'success', data: fav });
  } catch (err) {
    if (err.code === 11000) return next(new AppError('Ad already saved', 400));
    throw err;
  }
});

exports.removeFavorite = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const adId = req.params.adId;

  const deleted = await Favorite.findOneAndDelete({ user: userId, ad: adId });
  if (!deleted) return next(new AppError('Favorite not found', 404));

  // decrement savesCount safely (not going below 0)
  await Ad.findByIdAndUpdate(adId, { $inc: { savesCount: -1 } });
  res.status(204).json({ status: 'success', data: null });
});

exports.getUserFavorites = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  // return only favorites where underlying ad is still active & not expired
  const now = new Date();
  const favs = await Favorite.find({ user: userId })
    .populate({
      path: 'ad',
      match: { isActive: true, expiresAt: { $gt: now } },
      select: 'title price brand model city town images createdAt',
      populate: { path: 'user', select: 'name' },
    })
    .sort('-createdAt');

  // filter out favorites where ad matched was null (expired/inactive)
  const ads = favs
    .filter(f => f.ad)
    .map(f => {
      const a = f.ad.toObject();
      a.thumbnail =
        Array.isArray(a.images) && a.images.length ? a.images[0] : null;
      return a;
    });

  res.status(200).json({ status: 'success', results: ads.length, data: ads });
});
