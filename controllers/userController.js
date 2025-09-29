const User = require('./../models/userModel');
const TempUser = require('./../models/tempUserModel');
const AppError = require('./../utils/appError');
const catchAsync = require('./../utils/catchAsync');
const { sendEmail, getEmailChangeHTML } = require('./../utils/email');
const crypto = require('crypto');
const validator = require('validator');

const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach(el => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

exports.updateMe = catchAsync(async (req, res, next) => {
  if (!req?.body) return next(new AppError('Please provide body', 400));

  if (req.body?.password || req.body?.passwordConfirm) {
    return next(
      new AppError(
        'This route is not for password updates. Please use /update-my-password',
        400,
      ),
    );
  }

  const user = await User.findById(req.user.id);
  let emailChangeRequested = false;
  let newEmail = null;

  // Check if user is trying to update email
  if (req.body.email) {
    newEmail = req.body.email.toLowerCase();

    if (!validator.isEmail(req.body.email))
      return next(new AppError('Email is not valid', 400));

    // Check if new email is different from current email
    if (newEmail === req.user.email) {
      return next(
        new AppError('New email must be different from current email', 400),
      );
    }

    // Check if new email is already taken by another user
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) {
      return next(
        new AppError(
          'This email is already registered to another account',
          400,
        ),
      );
    }

    // Check if new email is already taken by a temp user (someone else signing up)
    const existingTempUser = await TempUser.findOne({ email: newEmail });
    if (existingTempUser) {
      return next(
        new AppError(
          'This email is currently being verified by another user',
          400,
        ),
      );
    }

    emailChangeRequested = true;
  }

  // Handle other profile updates (name, photo, etc.) - these update immediately
  const filteredBody = filterObj(req.body, 'name', 'photo');
  if (Object.keys(filteredBody).length > 0) {
    Object.keys(filteredBody).forEach(key => {
      user[key] = filteredBody[key];
    });
    await user.save({ validateBeforeSave: false });
  }

  // Handle email change with verification
  if (emailChangeRequested) {
    user.pendingEmail = newEmail;
    const changeToken = user.createEmailChangeToken();
    await user.save({ validateBeforeSave: false });

    try {
      // Send verification email to NEW email address
      const verifyURL = `http://localhost:3000/api/v1/users/verify-email-change/${changeToken}`;
      const htmlContent = getEmailChangeHTML(user.name, newEmail, verifyURL);
      const textContent = `Hi ${user.name.split(' ')[0]}! Verify your new email address: ${verifyURL}`;

      await sendEmail(
        newEmail,
        'Verify Your New Email Address - Your App',
        htmlContent,
        textContent,
      );

      // Get updated user data
      const updatedUser = await User.findById(req.user.id);

      res.status(200).json({
        status: 'success',
        message: `Profile updated. Verification email sent to ${newEmail}. Please check your inbox and click the verification link to complete the email change.`,
        data: {
          user: {
            id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            photo: updatedUser.photo,
            role: updatedUser.role,
            pendingEmail: updatedUser.pendingEmail,
          },
        },
      });
    } catch (err) {
      // Clear the pending email change if email fails
      user.pendingEmail = undefined;
      user.emailChangeToken = undefined;
      user.emailChangeExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return next(
        new AppError(
          'Profile updated but failed to send verification email. Please try changing email again.',
          500,
        ),
      );
    }
  } else {
    // No email change, just return updated user
    const updatedUser = await User.findById(req.user.id);

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        user: {
          id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          photo: updatedUser.photo,
          role: updatedUser.role,
        },
      },
    });
  }
});

exports.verifyEmailChange = catchAsync(async (req, res, next) => {
  // Get user based on the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    emailChangeToken: hashedToken,
    emailChangeExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError('Invalid or expired email change token', 400));
  }

  if (!user.pendingEmail) {
    return next(new AppError('No pending email change found', 400));
  }

  // Update user's email
  const oldEmail = user.email;
  user.email = user.pendingEmail;
  user.pendingEmail = undefined;
  user.emailChangeToken = undefined;
  user.emailChangeExpires = undefined;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: `Email successfully changed from ${oldEmail} to ${user.email}`,
  });
});

exports.cancelEmailChange = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user.pendingEmail) {
    return next(new AppError('No pending email change found', 400));
  }

  // Clear pending email change
  const pendingEmail = user.pendingEmail;
  user.pendingEmail = undefined;
  user.emailChangeToken = undefined;
  user.emailChangeExpires = undefined;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: `Email change to ${pendingEmail} has been cancelled`,
  });
});

exports.getMe = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  res.status(200).json({
    status: 'success',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        photo: user.photo,
        role: user.role,
        pendingEmail: user.pendingEmail, // Show if there's a pending email change
      },
    },
  });
});

exports.deleteMe = catchAsync(async (req, res, next) => {
  await User.findOneAndDelete({ _id: req.user.id });

  res.status(204).json({
    status: 'success',
    data: null,
  });
});
