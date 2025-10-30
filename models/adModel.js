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
      maxlength: 1000,
      minlength: 20,
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
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      // default: () => new Date(Date.now() + 2 * 60 * 1000),
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
  if (this.isActive && this.expiresAt && new Date() > this.expiresAt) {
    this.isActive = false;
    await this.save();
  }
  return this;
};

// Ensure images are removed from disk whenever an ad is deleted via findByIdAndDelete/findOneAndDelete
adSchema.pre('findOneAndDelete', async function (next) {
  try {
    const path = require('path');
    const fs = require('fs');
    const doc = await this.model
      .findOne(this.getQuery())
      .select('images')
      .lean();

    if (doc && Array.isArray(doc.images)) {
      doc.images.forEach(img => {
        const imgPath = path.join(
          __dirname,
          '..',
          'public',
          'uploads',
          'ads',
          img,
        );
        if (fs.existsSync(imgPath)) {
          try {
            fs.unlinkSync(imgPath);
          } catch (e) {
            console.error(
              'Failed to delete ad image in hook:',
              img,
              e?.message || e,
            );
          }
        }
      });
    }
    next();
  } catch (err) {
    next(err);
  }
});

const Ad = mongoose.model('Ad', adSchema);
module.exports = Ad;
