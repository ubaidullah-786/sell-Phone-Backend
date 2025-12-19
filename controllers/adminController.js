const User = require('../models/userModel');
const Ad = require('../models/adModel');
const Chat = require('../models/chatModel');
const Message = require('../models/messageModel');
const Favorite = require('../models/favoriteModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Get dashboard overview statistics
exports.getDashboardStats = catchAsync(async (req, res, next) => {
  const now = new Date();

  const [
    totalUsers,
    totalAds,
    activeAds,
    expiredAds,
    totalChats,
    totalMessages,
    totalFavorites,
  ] = await Promise.all([
    User.countDocuments({ role: { $ne: 'admin' } }),
    Ad.countDocuments(),
    Ad.countDocuments({ isActive: true, expiresAt: { $gt: now } }),
    Ad.countDocuments({
      $or: [{ isActive: false }, { expiresAt: { $lte: now } }],
    }),
    Chat.countDocuments(),
    Message.countDocuments(),
    Favorite.countDocuments(),
  ]);

  // Get users registered in last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const newUsersThisWeek = await User.countDocuments({
    role: { $ne: 'admin' },
    _id: {
      $gte: require('mongoose').Types.ObjectId.createFromTime(
        Math.floor(sevenDaysAgo.getTime() / 1000),
      ),
    },
  });

  // Get ads posted in last 7 days
  const newAdsThisWeek = await Ad.countDocuments({
    createdAt: { $gte: sevenDaysAgo },
  });

  res.status(200).json({
    status: 'success',
    data: {
      overview: {
        totalUsers,
        totalAds,
        activeAds,
        expiredAds,
        totalChats,
        totalMessages,
        totalFavorites,
        newUsersThisWeek,
        newAdsThisWeek,
      },
    },
  });
});

// Get user statistics with trends
exports.getUserStats = catchAsync(async (req, res, next) => {
  // Get monthly user registrations for the last 12 months
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const monthlyRegistrations = await User.aggregate([
    {
      $match: {
        role: { $ne: 'admin' },
        _id: {
          $gte: require('mongoose').Types.ObjectId.createFromTime(
            Math.floor(twelveMonthsAgo.getTime() / 1000),
          ),
        },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$_id' },
          month: { $month: '$_id' },
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 },
    },
  ]);

  // Format monthly data
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  const formattedMonthlyData = monthlyRegistrations.map(item => ({
    month: `${monthNames[item._id.month - 1]} ${item._id.year}`,
    users: item.count,
  }));

  // Get top users by ad count
  const topUsersByAds = await Ad.aggregate([
    {
      $group: {
        _id: '$user',
        adCount: { $sum: 1 },
      },
    },
    {
      $sort: { adCount: -1 },
    },
    {
      $limit: 10,
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    {
      $unwind: '$user',
    },
    {
      $project: {
        _id: 1,
        adCount: 1,
        'user.name': 1,
        'user.email': 1,
        'user.photo': 1,
      },
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      monthlyRegistrations: formattedMonthlyData,
      topUsersByAds,
    },
  });
});

// Get ad statistics
exports.getAdStats = catchAsync(async (req, res, next) => {
  const now = new Date();

  // Calculate ads by status based on isActive and expiresAt
  const [activeCount, expiredCount, inactiveCount] = await Promise.all([
    Ad.countDocuments({ isActive: true, expiresAt: { $gt: now } }),
    Ad.countDocuments({ isActive: true, expiresAt: { $lte: now } }),
    Ad.countDocuments({ isActive: false }),
  ]);

  const adsByStatus = [
    { status: 'Active', count: activeCount },
    { status: 'Expired', count: expiredCount },
    { status: 'Inactive', count: inactiveCount },
  ].filter(item => item.count > 0);

  // Ads by condition
  const adsByCondition = await Ad.aggregate([
    {
      $group: {
        _id: '$condition',
        count: { $sum: 1 },
      },
    },
  ]);

  // Ads by brand (top 10)
  const adsByBrand = await Ad.aggregate([
    {
      $group: {
        _id: '$brand',
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
    {
      $limit: 10,
    },
  ]);

  // Ads by city (top 10)
  const adsByCity = await Ad.aggregate([
    {
      $group: {
        _id: '$city',
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
    {
      $limit: 10,
    },
  ]);

  // Price statistics
  const priceStats = await Ad.aggregate([
    {
      $group: {
        _id: null,
        avgPrice: { $avg: '$price' },
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' },
        totalValue: { $sum: '$price' },
      },
    },
  ]);

  // Monthly ads for the last 12 months
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const monthlyAds = await Ad.aggregate([
    {
      $match: {
        createdAt: { $gte: twelveMonthsAgo },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 },
    },
  ]);

  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  const formattedMonthlyAds = monthlyAds.map(item => ({
    month: `${monthNames[item._id.month - 1]} ${item._id.year}`,
    ads: item.count,
  }));

  res.status(200).json({
    status: 'success',
    data: {
      adsByStatus,
      adsByCondition: adsByCondition.map(item => ({
        condition: item._id || 'unknown',
        count: item.count,
      })),
      adsByBrand: adsByBrand.map(item => ({
        brand: item._id || 'unknown',
        count: item.count,
      })),
      adsByCity: adsByCity.map(item => ({
        city: item._id || 'unknown',
        count: item.count,
      })),
      priceStats: priceStats[0] || {
        avgPrice: 0,
        minPrice: 0,
        maxPrice: 0,
        totalValue: 0,
      },
      monthlyAds: formattedMonthlyAds,
    },
  });
});

// Get chat/message statistics
exports.getChatStats = catchAsync(async (req, res, next) => {
  // Total messages per day for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailyMessages = await Message.aggregate([
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 },
    },
  ]);

  const formattedDailyMessages = dailyMessages.map(item => ({
    date: `${item._id.day}/${item._id.month}`,
    messages: item.count,
  }));

  // Active chats (chats with messages in last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const activeChats = await Chat.countDocuments({
    lastMessageAt: { $gte: sevenDaysAgo },
  });

  // Average messages per chat
  const avgMessagesPerChat = await Message.aggregate([
    {
      $group: {
        _id: '$chat',
        messageCount: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: null,
        avgMessages: { $avg: '$messageCount' },
      },
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      dailyMessages: formattedDailyMessages,
      activeChatsThisWeek: activeChats,
      avgMessagesPerChat: avgMessagesPerChat[0]?.avgMessages || 0,
    },
  });
});

// Get all users (paginated)
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const search = req.query.search || '';

  const query = { role: { $ne: 'admin' } };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .select('name email photo role createdAt')
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(query),
  ]);

  // Get ad count for each user
  const userIds = users.map(u => u._id);
  const adCounts = await Ad.aggregate([
    { $match: { user: { $in: userIds } } },
    { $group: { _id: '$user', count: { $sum: 1 } } },
  ]);

  const adCountMap = {};
  adCounts.forEach(item => {
    adCountMap[item._id.toString()] = item.count;
  });

  const usersWithAdCount = users.map(user => ({
    ...user.toObject(),
    adCount: adCountMap[user._id.toString()] || 0,
  }));

  res.status(200).json({
    status: 'success',
    results: users.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: usersWithAdCount,
  });
});

// Get all ads (paginated)
exports.getAllAds = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const search = req.query.search || '';
  const status = req.query.status || '';

  const query = {};

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { brand: { $regex: search, $options: 'i' } },
      { model: { $regex: search, $options: 'i' } },
    ];
  }

  if (status) {
    query.status = status;
  }

  const [ads, total] = await Promise.all([
    Ad.find(query)
      .select('title brand model price status city images createdAt user')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Ad.countDocuments(query),
  ]);

  res.status(200).json({
    status: 'success',
    results: ads.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: ads,
  });
});

// Delete a user
exports.deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  if (user.role === 'admin') {
    return next(new AppError('Cannot delete admin user', 403));
  }

  await User.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// Delete an ad
exports.deleteAd = catchAsync(async (req, res, next) => {
  const ad = await Ad.findById(req.params.id);

  if (!ad) {
    return next(new AppError('No ad found with that ID', 404));
  }

  await Ad.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// Update ad status
exports.updateAdStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;

  if (!['active', 'sold', 'inactive'].includes(status)) {
    return next(new AppError('Invalid status value', 400));
  }

  const ad = await Ad.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true },
  );

  if (!ad) {
    return next(new AppError('No ad found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: ad,
  });
});
