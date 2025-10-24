// UPDATED socket-server.js with automatic message delivery on user online

const socketIo = require('socket.io');
const Message = require('./models/messageModel');
const Chat = require('./models/chatModel');
const {
  addSocketForUser,
  removeSocketForUser,
  getSocketIds,
  isUserOnline,
} = require('./utils/presence');

let ioInstance = null;

function initSocket(server) {
  ioInstance = socketIo(server, { cors: { origin: '*' } });

  ioInstance.on('connection', socket => {
    console.log('socket connected', socket.id);

    // client MUST emit 'presence:online' after authentication with their userId
    socket.on('presence:online', async userId => {
      if (!userId) return;
      addSocketForUser(userId, socket.id);

      // NEW: Mark all pending messages for this user as delivered
      try {
        // Find all messages where this user is recipient and status is 'sent'
        const pendingMessages = await Message.find({
          recipient: userId,
          status: 'sent',
        }).select('_id sender chat');

        if (pendingMessages.length > 0) {
          // Update all to delivered
          await Message.updateMany(
            { recipient: userId, status: 'sent' },
            { $set: { status: 'delivered', updatedAt: new Date() } },
          );

          // Notify each sender about delivery
          pendingMessages.forEach(msg => {
            const senderId = msg.sender.toString();
            const senderSocketIds = getSocketIds(senderId);
            senderSocketIds.forEach(sid => {
              ioInstance.to(sid).emit('message:status', {
                messageId: msg._id,
                status: 'delivered',
              });
            });
          });

          console.log(
            `Marked ${pendingMessages.length} messages as delivered for user ${userId}`,
          );
        }
      } catch (err) {
        console.error(
          'Error marking messages as delivered on user online:',
          err,
        );
      }

      // Broadcast to all connected clients that this user is online
      ioInstance.emit('presence:userOnline', { userId });
    });

    // client notifies server that it's reading a chat -> mark messages as read
    // payload: { chatId, userId }
    socket.on('chat:markRead', async ({ chatId, userId }) => {
      try {
        if (!chatId || !userId) return;
        // set messages where recipient == userId and status != 'read' -> read
        const res = await Message.updateMany(
          { chat: chatId, recipient: userId, status: { $ne: 'read' } },
          { $set: { status: 'read', updatedAt: new Date() } },
        );
        // notify other participants (send status update)
        // get updated messages to inform senders (optional)
        const updated = await Message.find({
          chat: chatId,
          recipient: userId,
          status: 'read',
        }).select('_id sender');
        updated.forEach(m => {
          const socketIds = getSocketIds(m.sender.toString());
          socketIds.forEach(sid =>
            ioInstance
              .to(sid)
              .emit('message:status', { messageId: m._id, status: 'read' }),
          );
        });
      } catch (err) {
        console.error('chat:markRead error', err);
      }
    });

    // real-time send message (socket side)
    // payload: { chatId, senderId, recipientId, content }
    socket.on('message:send', async payload => {
      try {
        const { chatId, senderId, recipientId, content } = payload;
        if (!chatId || !senderId || !recipientId || !content) return;

        const message = await Message.create({
          chat: chatId,
          sender: senderId,
          recipient: recipientId,
          content,
          status: 'sent',
        });

        await Chat.findByIdAndUpdate(chatId, {
          lastMessage: message._id,
          updatedAt: new Date(),
        });

        // notify sender (persisted -> single tick)
        socket.emit('message:status', {
          messageId: message._id,
          status: 'sent',
        });

        // deliver to recipient if online
        const recipientSockets = getSocketIds(recipientId);
        if (recipientSockets.length) {
          recipientSockets.forEach(sid =>
            ioInstance.to(sid).emit('message:receive', message),
          );
          // update DB to delivered
          message.status = 'delivered';
          await message.save();
          // notify sender about delivery
          socket.emit('message:status', {
            messageId: message._id,
            status: 'delivered',
          });
        }
      } catch (err) {
        console.error('socket message:send error', err);
      }
    });

    socket.on('disconnect', () => {
      // remove this socket from any user mappings
      const { onlineUsers } = require('./utils/presence');
      let disconnectedUserId = null;

      for (const [userId, set] of onlineUsers.entries()) {
        if (set.has(socket.id)) {
          removeSocketForUser(userId, socket.id);
          // Check if user is now completely offline (no other sockets)
          if (!onlineUsers.has(userId)) {
            disconnectedUserId = userId;
          }
          break;
        }
      }

      // If user went fully offline, broadcast it
      if (disconnectedUserId) {
        ioInstance.emit('presence:userOffline', { userId: disconnectedUserId });
      }

      console.log('socket disconnected', socket.id);
    });
  });

  return ioInstance;
}

function getIo() {
  if (!ioInstance)
    throw new Error(
      'Socket.io not initialized. Call initSocket(server) first.',
    );
  return ioInstance;
}

module.exports = { initSocket, getIo };
