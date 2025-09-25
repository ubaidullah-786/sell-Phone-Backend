const mongoose = require('mongoose');

const adSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      minlength: 10,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
      minlength: 50,
    },
    images: { type: [String], required: true },
    price: { type: Number, required: true, min: 500, max: 1000000 },
    condition: {
      type: String,
      enum: ['New', 'Used', 'Not working / Only for parts'],
      required: true,
    },
    brand: { type: String, required: true },
    model: { type: String, required: true },
    city: { type: String, required: true },
    town: { type: String, required: true },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    savesCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// virtual for expired flag
adSchema.virtual('isExpired').get(function () {
  return new Date() > this.expiresAt;
});

// Pre-save ensure inactive if expired
adSchema.pre('save', function (next) {
  if (this.expiresAt && new Date() > this.expiresAt) this.isActive = false;
  next();
});

/**
 * Static: getPublicList
 * returns thin list of active & non-expired ads according to filter
 * options = { skip, limit, sortBy }
 */
adSchema.statics.getPublicList = function (filter = {}, options = {}) {
  const now = new Date();
  const baseMatch = {
    isActive: true,
    expiresAt: { $gt: now },
    ...filter,
  };

  const sortStage = {};
  // featured first, then most recent
  sortStage.isFeatured = -1;
  sortStage.createdAt = -1;

  const pipeline = [
    { $match: baseMatch },
    {
      $project: {
        title: 1,
        price: 1,
        brand: 1,
        model: 1,
        city: 1,
        town: 1,
        images: 1,
        isFeatured: 1,
        createdAt: 1,
        user: 1, // we will populate name in controller if needed
      },
    },
    { $sort: sortStage },
  ];

  if (options.skip) pipeline.push({ $skip: options.skip });
  if (options.limit) pipeline.push({ $limit: options.limit });

  return this.aggregate(pipeline).exec();
};

/**
 * Static: getByIdForUser
 * - If ad is active & not expired -> return ad (public)
 * - If ad is inactive/expired -> only return if requester is owner
 * - If requester is owner -> include savesCount
 */
adSchema.statics.getByIdForUser = async function (adId, requesterId = null) {
  const ObjectId = mongoose.Types.ObjectId;
  const now = new Date();

  const ad = await this.findById(adId).populate('user', 'name email').lean();
  if (!ad) return null;

  const expired = ad.expiresAt && new Date(ad.expiresAt) <= now;
  const activeAndNotExpired = ad.isActive && !expired;

  // if ad is not active or expired, require owner
  if (!activeAndNotExpired) {
    if (!requesterId || ad.user._id.toString() !== requesterId.toString()) {
      // not permitted to view inactive/expired ad
      return { notAccessible: true };
    }
  }

  // If requester is owner, attach savesCount
  if (requesterId && ad.user._id.toString() === requesterId.toString()) {
    // try to use savesCount field if maintained
    if (typeof ad.savesCount === 'number') {
      ad.savesCount = ad.savesCount;
    } else {
      // fallback — compute on demand (controller can compute)
      ad.savesCount = null;
    }
  } else {
    delete ad.savesCount;
  }

  return { ad, activeAndNotExpired };
};

/**
 * Static: getMyAdsWithSaves
 * returns all ads for userId (including inactive/expired)
 * attaches savesCount for active ads (0 or number)
 */
adSchema.statics.getMyAdsWithSaves = function (userId) {
  const ObjectId = mongoose.Types.ObjectId;
  return this.aggregate([
    { $match: { user: ObjectId(userId) } },
    // left join favorites to count saves (but we only include counts for active ads)
    {
      $lookup: {
        from: 'favorites',
        localField: '_id',
        foreignField: 'ad',
        as: 'favorites',
      },
    },
    {
      $addFields: {
        savesCount: {
          $cond: [{ $eq: ['$isActive', true] }, { $size: '$favorites' }, null],
        },
      },
    },
    {
      $project: {
        favorites: 0, // remove array
        title: 1,
        price: 1,
        brand: 1,
        model: 1,
        city: 1,
        town: 1,
        images: 1,
        isActive: 1,
        createdAt: 1,
        expiresAt: 1,
        savesCount: 1,
      },
    },
    { $sort: { createdAt: -1 } },
  ]).exec();
};

const Ad = mongoose.model('Ad', adSchema);
module.exports = Ad;
