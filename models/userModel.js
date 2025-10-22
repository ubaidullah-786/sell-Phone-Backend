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
  const userId = this.getQuery()['_id'];

  try {
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
