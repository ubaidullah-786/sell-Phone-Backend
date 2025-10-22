// controllers/chatController.js
const mongoose = require('mongoose');
const Chat = require('../models/chatModel');
const Message = require('../models/messageModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// presence helpers
const { isUserOnline } = require('../utils/presence');
// socket instance (may throw if not initialized)
let socketModule;
try {
  socketModule = require('../socketServer');
} catch (e) {
  socketModule = null;
}

exports.startChat = catchAsync(async (req, res, next) => {
  if (!req?.body) return next(new AppError('Please provide body', 400));
  const { recipientId, adId } = req.body; // Add adId
  const userId = req.user.id;

  if (!recipientId) return next(new AppError('recipientId required', 400));
  if (!mongoose.Types.ObjectId.isValid(recipientId))
    return next(new AppError('Invalid recipientId', 400));
  if (recipientId === userId)
    return next(new AppError('Cannot start chat with yourself', 400));

  // Validate adId if provided
  if (adId && !mongoose.Types.ObjectId.isValid(adId)) {
    return next(new AppError('Invalid adId', 400));
  }

  // Find existing chat for this ad and participants
  let chat;
  if (adId) {
    chat = await Chat.findOne({
      participants: { $all: [userId, recipientId] },
      ad: adId,
    });
  } else {
    // Backward compatibility: find chat without ad
    chat = await Chat.findOne({
      participants: { $all: [userId, recipientId] },
    });
  }

  if (!chat) {
    chat = await Chat.create({
      participants: [userId, recipientId],
      ad: adId || null,
    });
  }

  res.status(201).json({ status: 'success', data: chat });
});

// GET /chats/my-chats
exports.getMyChats = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  if (!mongoose.Types.ObjectId.isValid(userId))
    return next(new AppError('Invalid user id', 400));
  const userOid = mongoose.Types.ObjectId.createFromHexString(userId);

  const pipeline = [
    { $match: { participants: userOid } },

    // peer id
    {
      $addFields: {
        otherParticipantId: {
          $arrayElemAt: [
            {
              $filter: {
                input: '$participants',
                cond: { $ne: ['$$this', userOid] },
              },
            },
            0,
          ],
        },
      },
    },

    // other user info
    {
      $lookup: {
        from: 'users',
        let: { otherId: '$otherParticipantId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$otherId'] } } },
          { $project: { name: 1, photo: 1, _id: 1 } },
        ],
        as: 'otherUser',
      },
    },
    { $addFields: { otherUser: { $arrayElemAt: ['$otherUser', 0] } } },

    // *** AD INFO - NEW SECTION ***
    {
      $lookup: {
        from: 'ads',
        let: { adId: '$ad' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$adId'] } } },
          {
            $project: {
              title: 1,
              images: 1,
              _id: 1,
            },
          },
        ],
        as: 'adInfo',
      },
    },
    {
      $addFields: {
        adInfo: { $arrayElemAt: ['$adInfo', 0] },
      },
    },
    // *** END AD INFO ***

    // last message
    {
      $lookup: {
        from: 'messages',
        let: { chatId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$chat', '$$chatId'] } } },
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
          {
            $project: {
              content: 1,
              sender: 1,
              recipient: 1,
              status: 1,
              createdAt: 1,
            },
          },
        ],
        as: 'lastMessageArr',
      },
    },
    { $addFields: { lastMessage: { $arrayElemAt: ['$lastMessageArr', 0] } } },

    // unread count
    {
      $lookup: {
        from: 'messages',
        let: { chatId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$chat', '$$chatId'] },
                  { $eq: ['$recipient', userOid] },
                  { $ne: ['$status', 'read'] },
                ],
              },
            },
          },
          { $count: 'count' },
        ],
        as: 'unreadArr',
      },
    },
    {
      $addFields: {
        unreadCount: {
          $cond: [
            { $gt: [{ $size: '$unreadArr' }, 0] },
            { $arrayElemAt: ['$unreadArr.count', 0] },
            0,
          ],
        },
      },
    },

    {
      $project: {
        participants: 0,
        lastMessageArr: 0,
        unreadArr: 0,
        otherParticipantId: 0,
      },
    },

    { $sort: { updatedAt: -1 } },
  ];

  const chats = await Chat.aggregate(pipeline).allowDiskUse(true).exec();

  // Attach online boolean using presence map AND transform ad info
  const transformed = chats.map(c => {
    const otherUser = c.otherUser || null;
    const otherId =
      otherUser && otherUser._id ? otherUser._id.toString() : null;
    const online = otherId ? isUserOnline(otherId) : false;

    // *** TRANSFORM AD INFO - NEW ***
    const adInfo = c.adInfo
      ? {
          _id: c.adInfo._id,
          title: c.adInfo.title,
          thumbnail:
            Array.isArray(c.adInfo.images) && c.adInfo.images.length
              ? c.adInfo.images[0]
              : null,
        }
      : null;
    // *** END TRANSFORM ***

    return {
      chatId: c._id,
      updatedAt: c.updatedAt,
      otherParticipant: otherUser
        ? {
            _id: otherUser._id,
            name: otherUser.name,
            photo: otherUser.photo,
            online,
          }
        : null,
      ad: adInfo, // *** ADD THIS FIELD ***
      lastMessage: c.lastMessage || null,
      unreadCount: c.unreadCount || 0,
    };
  });

  res.status(200).json({
    status: 'success',
    results: transformed.length,
    data: transformed,
  });
});

// GET /chats/:chatId/messages?page=1&limit=50
exports.getMessages = catchAsync(async (req, res, next) => {
  const { chatId } = req.params;
  const page = Math.max(parseInt(req.query.page || '1', 10), 1);
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const skip = (page - 1) * limit;

  if (!mongoose.Types.ObjectId.isValid(chatId))
    return next(new AppError('Invalid chatId', 400));

  const messages = await Message.find({ chat: chatId })
    .populate('sender', 'name photo')
    .populate('recipient', 'name photo')
    .sort('createdAt')
    .skip(skip)
    .limit(limit)
    .lean();

  res
    .status(200)
    .json({ status: 'success', results: messages.length, data: messages });
});

/**
 * REST sendMessage (also notifies via sockets if available)
 * POST /chats/:chatId/messages
 * body: { recipientId, content }
 */
exports.sendMessage = catchAsync(async (req, res, next) => {
  if (!req?.body) return next(new AppError('Please provide body', 400));
  const { chatId } = req.params;
  const senderId = req.user.id;
  const { recipientId, content } = req.body;
  const chat = await Chat.findById(chatId);
  if (!chat) {
    return res.status(404).json({ status: 'fail', message: 'Chat not found' });
  }

  // ensure both sender and recipient are valid participants
  if (!chat.participants.some(p => p.toString() === req.user.id)) {
    return res.status(403).json({
      status: 'fail',
      message: 'You are not a participant of this chat',
    });
  }

  if (!chat.participants.some(p => p.toString() === recipientId)) {
    return res.status(400).json({
      status: 'fail',
      message: 'Recipient is not a participant in this chat',
    });
  }

  if (!mongoose.Types.ObjectId.isValid(chatId))
    return next(new AppError('Invalid chatId', 400));
  if (!mongoose.Types.ObjectId.isValid(recipientId))
    return next(new AppError('Invalid recipientId', 400));
  if (!content || !content.trim())
    return next(new AppError('Message content required', 400));

  if (String(senderId) === String(recipientId)) {
    return next(new AppError('You cannot send a message to yourself', 400));
  }

  const message = await Message.create({
    chat: chatId,
    sender: senderId,
    recipient: recipientId,
    content: content.trim(),
    status: 'sent',
  });

  await Chat.findByIdAndUpdate(chatId, {
    lastMessage: message._id,
    updatedAt: new Date(),
  });

  // emit status to sender (sent)
  // try to emit via socket if server initialized
  try {
    const socketSrv = require('../socketServer');
    const io = socketSrv.getIo();
    io.to(req.socket.id).emit('message:status', {
      messageId: message._id,
      status: 'sent',
    });
  } catch (e) {
    // ignore if socket not initialized or emit fails
  }

  // deliver to recipient if online (use presence)
  if (isUserOnline(recipientId)) {
    // update message status to delivered
    message.status = 'delivered';
    await message.save();

    // notify recipient sockets
    const { getSocketIds } = require('../utils/presence');
    const socketIds = getSocketIds(recipientId);
    try {
      const io = require('../socketServer').getIo();
      socketIds.forEach(sid => io.to(sid).emit('message:receive', message));
      // notify sender of delivery
      try {
        const io2 = require('../socketServer').getIo();
        io2.to(req.socket.id).emit('message:status', {
          messageId: message._id,
          status: 'delivered',
        });
      } catch (e) {}
    } catch (e) {
      // ignore if io not initialized
    }
  }

  res.status(201).json({ status: 'success', data: message });
});
