// socketServer.js
const socketIo = require('socket.io');
const Message = require('./models/messageModel');
const Chat = require('./models/chatModel');
const {
  addSocketForUser,
  removeSocketForUser,
  getSocketIds,
} = require('./utils/presence');

let ioInstance = null;

function initSocket(server) {
  ioInstance = socketIo(server, { cors: { origin: '*' } });

  ioInstance.on('connection', socket => {
    console.log('socket connected', socket.id);

    // client MUST emit 'presence:online' after authentication with their userId
    socket.on('presence:online', userId => {
      if (!userId) return;
      addSocketForUser(userId, socket.id);
      // optionally emit presence change: ioInstance.emit('presence:update', { userId, online:true })
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
      // We must find which user had this socketId
      // Approach: iterate presence map (acceptable for single server). For large scale use reverse map or Redis.
      // We'll remove any entry that matched socket.id
      const { onlineUsers } = require('./lib/presence');
      for (const [userId, set] of onlineUsers.entries()) {
        if (set.has(socket.id)) {
          removeSocketForUser(userId, socket.id);
          break;
        }
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
