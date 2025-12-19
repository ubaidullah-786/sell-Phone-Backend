const User = require('../models/userModel');
const bcrypt = require('bcryptjs');

const createAdminUser = async () => {
  try {
    // Check if admin already exists
    const adminExists = await User.findOne({ role: 'admin' });

    if (adminExists) {
      console.log('Admin user already exists');
      return;
    }

    // Create admin user
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    const adminUser = new User({
      name: 'Admin',
      email: process.env.ADMIN_EMAIL || 'admin@sellphone.app',
      password: hashedPassword,
      role: 'admin',
    });

    // Skip password hashing since we already hashed it
    adminUser._skipPasswordHash = true;
    await adminUser.save({ validateBeforeSave: false });
  } catch (error) {
    console.error('Error creating admin user:', error.message);
  }
};

module.exports = { createAdminUser };
