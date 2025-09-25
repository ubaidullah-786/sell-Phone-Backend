const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    ad: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ad',
      required: true,
    },
  },
  { timestamps: true },
);

// Ensure a user can only favorite an ad once
favoriteSchema.index({ user: 1, ad: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', favoriteSchema);
