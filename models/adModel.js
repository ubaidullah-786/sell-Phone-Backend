const mongoose = require('mongoose');

const adSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Ad must have a title'],
      trim: true,
      maxlength: 50,
      minlength: 10,
    },
    description: {
      type: String,
      required: [true, 'Please provide a description'],
      trim: true,
      maxlength: 2000,
      minlength: 50,
    },
    images: {
      type: [String],
      required: true,
    }, // store image filenames/URLs

    price: {
      type: Number,
      required: [true, 'Ad must have a price'],
      min: 500,
      max: 1000000,
    },
    condition: {
      type: String,
      enum: ['New', 'Used', 'Not working / Only for parts'],
      required: true,
    },

    // Phone Info
    brand: {
      type: String,
      required: true,
    },
    model: {
      type: String,
      required: true,
    },

    // Location Info
    city: {
      type: String,
      required: true,
    },
    town: {
      type: String,
      required: true,
    },

    // Flags
    isFeatured: {
      type: Boolean,
      default: false,
    },

    // Ownership
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true },
);

const Ad = mongoose.model('Ad', adSchema);
module.exports = Ad;
