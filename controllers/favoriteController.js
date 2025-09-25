const Favorite = require('../models/favoriteModel');
const Ad = require('../models/adModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

// POST /api/v1/favorites/:adId  (protected) - save an ad
exports.addFavorite = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const { adId } = req.params;

  // ensure ad exists
  const ad = await Ad.findById(adId);
  if (!ad) return next(new AppError('Ad not found', 404));

  // create favorite docs but prevent duplicates via unique index
  try {
    const fav = await Favorite.create({ user: userId, ad: adId });
    res.status(201).json({ status: 'success', data: fav });
  } catch (err) {
    // duplicate key will throw a MongoError (E11000) due to unique index
    if (err.code === 11000) {
      return next(new AppError('Ad already saved', 400));
    }
    throw err;
  }
});

// DELETE /api/v1/favorites/:adId  (protected) - remove saved ad
exports.removeFavorite = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const { adId } = req.params;

  const deleted = await Favorite.findOneAndDelete({ user: userId, ad: adId });
  if (!deleted) {
    return next(new AppError('Favorite not found', 404));
  }

  res.status(204).json({ status: 'success', data: null });
});

// GET /api/v1/favorites  (protected) - list user's saved ads
exports.getUserFavorites = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  // populate ad details (update fields as you like)
  const favs = await Favorite.find({ user: userId }).populate({
    path: 'ad',
    populate: { path: 'user', select: 'name' },
  });

  // return list of ad objects (or return favorite docs)
  const ads = favs.map(f => f.ad);

  res.status(200).json({
    status: 'success',
    results: ads.length,
    data: ads,
  });
});
