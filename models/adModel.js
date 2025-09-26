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
    },

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
    isActive: {
      type: Boolean,
      default: true,
    },

    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 60 * 1000), // 30 days from creation
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

// Virtual to check if expired
adSchema.virtual('isExpired').get(function () {
  return new Date() > this.expiresAt;
});

// Pre middleware to prevent activation after expiry
adSchema.pre('save', function (next) {
  if (this.isExpired && this.isActive) {
    this.isActive = false;
  }
  next();
});

adSchema.methods.ensureActiveStatus = async function () {
  if (this.expiresAt && new Date() > this.expiresAt && this.isActive) {
    this.isActive = false;
    await this.save();
  }
  return this;
};

const Ad = mongoose.model('Ad', adSchema);
module.exports = Ad;
