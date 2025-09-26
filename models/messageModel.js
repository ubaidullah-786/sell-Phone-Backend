const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: { type: String, required: true },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },
  },
  { timestamps: true },
);

messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, status: 1 });

module.exports = mongoose.model('Message', messageSchema);
