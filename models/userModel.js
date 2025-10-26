const crypto = require('crypto');
const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const Ad = require('./adModel');
const Chat = require('./chatModel');
const Favorite = require('./favoriteModel');
const Message = require('./messageModel');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please tell us your name!'],
  },
  email: {
    type: String,
    required: [true, 'Please provide your email'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email'],
  },
  photo: String,
  role: {
    type: String,
    enum: ['user', 'guide', 'lead-guide', 'admin'],
    default: 'user',
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 8,
    select: false,
  },
  passwordConfirm: {
    type: String,
    validate: {
      validator: function (el) {
        return el === this.password;
      },
      message: 'Passwords are not the same!',
    },
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,

  pendingEmail: String, // New email waiting for verification
  emailChangeToken: String,
  emailChangeExpires: Date,
});

// Updated password hashing middleware
userSchema.pre('save', async function (next) {
  // Skip hashing if password is not modified OR if we're transferring from temp user
  if (!this.isModified('password') || this._skipPasswordHash) return next();

  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = undefined;
  next();
});

userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();
  this.passwordChangedAt = Date.now() - 1000;
  next();
});

userSchema.pre('findOneAndDelete', async function (next) {
  const path = require('path');
  const fs = require('fs');
  const userId = this.getQuery()['_id'];

  try {
    // 1) Delete user's photo from disk, if any
    const user = await this.model.findById(userId).select('photo').lean();
    if (user && user.photo) {
      // user.photo may start with '/uploads/users/...'; normalize to relative path under public
      const relPhoto = user.photo.replace(/^[/\\]+/, '');
      const photoPath = path.join(__dirname, '..', 'public', relPhoto);
      if (fs.existsSync(photoPath)) {
        try {
          fs.unlinkSync(photoPath);
        } catch (e) {
          console.error('Failed to delete user photo:', e?.message || e);
        }
      }
    }

    // 2) Delete all images for ads owned by this user from disk
    const userAds = await Ad.find({ user: userId }).select('images').lean();
    userAds.forEach(ad => {
      if (Array.isArray(ad.images)) {
        ad.images.forEach(img => {
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
              console.error('Failed to delete ad image:', img, e?.message || e);
            }
          }
        });
      }
    });

    // 3) Delete related documents from the database
    await Promise.all([
      Ad.deleteMany({ user: userId }),
      Chat.deleteMany({ participants: userId }),
      Message.deleteMany({
        $or: [{ sender: userId }, { recipient: userId }],
      }),
      Favorite.deleteMany({ user: userId }),
    ]);

    next();
  } catch (error) {
    next(error);
  }
});
userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword,
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimeStamp) {
  if (this.passwordChangedAt) {
    const changedTimeStamp = parseInt(this.passwordChangedAt.getTime() / 1000);
    return JWTTimeStamp < changedTimeStamp;
  }
  return false;
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return resetToken;
};

userSchema.methods.createEmailChangeToken = function () {
  const changeToken = crypto.randomBytes(32).toString('hex');
  this.emailChangeToken = crypto
    .createHash('sha256')
    .update(changeToken)
    .digest('hex');
  this.emailChangeExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return changeToken;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
