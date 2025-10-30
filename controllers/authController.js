const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('./../models/userModel');
const TempUser = require('./../models/tempUserModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const {
  sendEmail,
  getEmailVerificationHTML,
  getPasswordResetHTML,
} = require('./../utils/email');

const signToken = id => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createSendToken = (user, statusCode, res, message = null) => {
  const token = signToken(user.id);
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // CRITICAL for mobile
  };

  res.cookie('jwt', token, cookieOptions);

  // Remove password from output
  user.password = undefined;
  const userData = {
    id: user.id,
    name: user.name,
    email: user.email,
  };

  if (user.photo) userData.photo = user.photo;

  const response = {
    status: 'success',
    token,
    data: {
      userData,
    },
  };

  if (message) response.message = message;
  res.status(statusCode).json(response);
};

// Step 1: User submits signup data - creates temp user and sends verification email
exports.signup = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('User with this email already exists', 400));
  }

  // Check if temp user already exists
  let tempUser = await TempUser.findOne({ email });
  if (tempUser) {
    // Delete existing temp user to create new one
    await TempUser.deleteOne({ email });
  }

  const userData = {
    name,
    email,
    password,
    passwordConfirm,
  };

  // Only add photo if user uploaded one
  if (req.file) {
    userData.photo = `/uploads/users/${req.file.filename}`;
  }

  // Create temporary user
  tempUser = await TempUser.create(userData);

  // Generate verification token
  const verifyToken = tempUser.createEmailVerificationToken();
  await tempUser.save({ validateBeforeSave: false });

  try {
    // Send verification email
    const frontendBase = process.env.FRONTEND_BASE_URL;
    const verifyURL = `${frontendBase.replace(/\/$/, '')}/verify-email/${verifyToken}`;
    const htmlContent = getEmailVerificationHTML(name, verifyURL);
    const textContent = `Hi ${name.split(' ')[0]}! Please verify your email by visiting: ${verifyURL}`;

    await sendEmail(
      email,
      'Verify Your Email Address - Sell Phone',
      htmlContent,
      textContent,
    );

    res.status(200).json({
      status: 'success',
      message:
        'Verification email sent! Please check your inbox and click the verification link to complete your account creation.',
    });
  } catch (err) {
    // Delete temp user if email fails
    await TempUser.deleteOne({ email });
    return next(
      new AppError('Failed to send verification email. Please try again.', 500),
    );
  }
});

// Step 2: User clicks verification link - creates actual user account
exports.verifyEmail = catchAsync(async (req, res, next) => {
  // Get user based on the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const tempUser = await TempUser.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  }).select('+password');

  if (!tempUser) {
    return next(new AppError('Invalid or expired verification token', 400));
  }

  // Create actual user account with pre-hashed password
  const newUser = new User({
    name: tempUser.name,
    email: tempUser.email,
    photo: tempUser.photo,
  });

  // Manually set the already-hashed password (bypass validation and hashing)
  newUser.password = tempUser.password;
  newUser._skipPasswordHash = true; // Flag to skip hashing

  await newUser.save({ validateBeforeSave: false });

  // Delete temp user
  await TempUser.deleteOne({ _id: tempUser._id });

  // Send success response
  res.status(200).json({
    status: 'success',
    message:
      'Email verified successfully! Your account has been created. You can now log in.',
  });
});

// Step 3: User login
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password)
    return next(new AppError('Please provide email and password', 400));

  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password)))
    return next(new AppError('Incorrect email or password', 401));

  createSendToken(user, 200, res);
});

exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    path: '/',
  });

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully',
  });
};

// Step 4: Forgot password
exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on POSTed email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError('There is no user with that email address.', 404));
  }

  // 2) Generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  try {
    // 3) Send it to user's email
    const frontendBase = process.env.FRONTEND_BASE_URL;
    const resetURL = `${frontendBase.replace(/\/$/, '')}/reset-password/${resetToken}`;
    const htmlContent = getPasswordResetHTML(user.name, resetURL);
    const textContent = `Forgot your password? Reset it here: ${resetURL}. If you didn't request this, please ignore this email.`;

    await sendEmail(
      user.email,
      'Your Password Reset Token (valid for 10 minutes)',
      htmlContent,
      textContent,
    );

    res.status(200).json({
      status: 'success',
      message: 'Password reset email sent! Check your inbox.',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError(
        'There was an error sending the email. Try again later.',
        500,
      ),
    );
  }
});

// Step 5: Reset password
exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // 2) If token has not expired, and there is user, set the new password
  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }
  if (!req?.body)
    return next(
      new AppError('Please provide password and passwordConfirm in body', 400),
    );

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // 3) Log the user in, send JWT
  createSendToken(user, 200, res);
});

exports.protect = catchAsync(async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  )
    token = req.headers.authorization.split(' ')[1];

  if (!token)
    return next(
      new AppError('You are not logged in. Please login to get access.', 401),
    );

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError(
        'The user belonging to this token does no longer exists.',
        401,
      ),
    );
  }

  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password. Please log in again.', 401),
    );
  }

  req.user = currentUser;
  next();
});

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403),
      );
    }

    next();
  };
};

exports.updatePassword = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('+password');

  if (
    !req.body?.currentPassword &&
    !req.body?.password &&
    !req.body?.passwordConfirm
  )
    return next(
      new AppError('Please provide current password and new password', 400),
    );

  if (!(await user.correctPassword(req.body.currentPassword, user.password)))
    return next(new AppError('Your current password is wrong', 401));

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();

  createSendToken(user, 200, res);
});

exports.optionalProtect = async (req, res, next) => {
  try {
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return next(); // no token, continue as guest

    // verify token
    let decoded;
    try {
      decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    } catch (err) {
      // invalid token -> ignore, continue as guest (do not throw)
      return next();
    }

    // find user and attach to req.user
    const currentUser = await User.findById(decoded.id).select('-password');
    if (!currentUser) return next(); // token user no longer exists

    req.user = currentUser;
    return next();
  } catch (err) {
    // any unexpected error -> continue as guest (to keep endpoint public)
    return next();
  }
};
