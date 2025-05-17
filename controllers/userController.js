const User = require('../models/User');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

/**
 * @desc    Get all users with pagination and filtering
 * @route   GET /api/users
 * @access  Private/Admin
 */
exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    
    // Basic filtering options
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
    
    // Execute query with pagination
    const users = await User.find(filter)
      .select('-password')
      .skip(startIndex)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    // Get total count for pagination
    const total = await User.countDocuments(filter);
    
    res.status(200).json({
      status: 'success',
      count: users.length,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      },
      data: users
    });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get current user profile
 * @route   GET /api/users/me
 * @access  Private
 */
exports.getCurrentUser = async (req, res) => {
  try {
    // req.user is already set by the auth middleware
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: user
    });
  } catch (error) {
    console.error('Error getting current user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get user profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update current user profile
 * @route   PUT /api/users/me
 * @access  Private
 */
exports.updateCurrentUser = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }
    
    const { name, email, phone } = req.body;
    
    // Find user
    let user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Check if email already exists for another user
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          status: 'error',
          message: 'Email already in use'
        });
      }
    }
    
    // Update user
    user.name = name || user.name;
    user.email = email || user.email;
    user.phone = phone || user.phone;
    
    // Save updated user
    await user.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get user by ID
 * @route   GET /api/users/:id
 * @access  Private/Admin
 */
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: user
    });
  } catch (error) {
    console.error('Error getting user by ID:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update user
 * @route   PUT /api/users/:id
 * @access  Private/Admin
 */
exports.updateUser = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }
    
    const { name, email, phone, role, isActive } = req.body;
    
    // Find user
    let user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Check if email already exists for another user
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          status: 'error',
          message: 'Email already in use'
        });
      }
    }
    
    // Update user fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    
    // Save updated user
    await user.save();
    
    res.status(200).json({
      status: 'success',
      message: 'User updated successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isActive: user.isActive
        }
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Delete user
 * @route   DELETE /api/users/:id
 * @access  Private/Admin
 */
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Check if trying to delete own account
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        status: 'error',
        message: 'You cannot delete your own account'
      });
    }
    
    await user.remove();
    
    res.status(200).json({
      status: 'success',
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Create new user (admin only)
 * @route   POST /api/users
 * @access  Private/Admin
 */
exports.createUser = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }
    
    const { name, email, password, phone, role } = req.body;
    
    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({
        status: 'error',
        message: 'User already exists'
      });
    }
    
    // Create new user
    user = new User({
      name,
      email,
      password,
      phone,
      role: role || 'client', // Default to client if no role provided
    });
    
    // Save user to database
    await user.save();
    
    res.status(201).json({
      status: 'success',
      message: 'User created successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone
        }
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Activate user account
 * @route   POST /api/users/:id/activate
 * @access  Private/Admin
 */
exports.activateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    user.isActive = true;
    await user.save();
    
    res.status(200).json({
      status: 'success',
      message: 'User account activated successfully'
    });
  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to activate user account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Deactivate user account
 * @route   POST /api/users/:id/deactivate
 * @access  Private/Admin
 */
exports.deactivateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Prevent deactivating own account
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        status: 'error',
        message: 'You cannot deactivate your own account'
      });
    }
    
    user.isActive = false;
    await user.save();
    
    res.status(200).json({
      status: 'success',
      message: 'User account deactivated successfully'
    });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to deactivate user account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Change current user password
 * @route   PUT /api/users/me/password
 * @access  Private
 */
exports.changePassword = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    // Get user with password
    const user = await User.findById(req.user.id).select('+password');
    
    // Check current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Current password is incorrect'
      });
    }
    
    // Update password
    user.password = newPassword;
    user.passwordChangedAt = Date.now();
    await user.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Request password reset (send reset email)
 * @route   POST /api/users/forgot-password
 * @access  Public
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'No user found with that email'
      });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    // Set expiration (10 minutes)
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    
    await user.save();
    
    // In a real application, you would send an email with the reset token
    // For now, just return a success message with token for testing
    if (process.env.NODE_ENV === 'development') {
      res.status(200).json({
        status: 'success',
        message: 'Password reset token sent to email',
        resetToken, // Only include in development
        resetUrl: `${req.protocol}://${req.get('host')}/api/users/reset-password/${resetToken}`
      });
    } else {
      res.status(200).json({
        status: 'success',
        message: 'Password reset token sent to email'
      });
    }
  } catch (error) {
    console.error('Error requesting password reset:', error);
    
    // Clear reset token fields
    if (user) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to request password reset',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Reset password using token
 * @route   POST /api/users/reset-password/:token
 * @access  Public
 */
exports.resetPassword = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        errors: errors.array()
      });
    }
    
    const { password } = req.body;
    const { token } = req.params;
    
    // Hash token from params
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    // Find user with matching token and valid expiration
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired token'
      });
    }
    
    // Set new password
    user.password = password;
    user.passwordChangedAt = Date.now();
    
    // Clear reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    
    await user.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Password reset successful'
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reset password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get user preferences
 * @route   GET /api/users/me/preferences
 * @access  Private
 */
exports.getUserPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('preferences');
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: user.preferences || {}
    });
  } catch (error) {
    console.error('Error getting user preferences:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get user preferences',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update user preferences
 * @route   PUT /api/users/me/preferences
 * @access  Private
 */
exports.updateUserPreferences = async (req, res) => {
  try {
    const preferences = req.body;
    
    // Find user
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Update preferences
    user.preferences = {
      ...(user.preferences || {}),
      ...preferences
    };
    
    await user.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Preferences updated successfully',
      data: user.preferences
    });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update user preferences',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get user notifications
 * @route   GET /api/users/me/notifications
 * @access  Private
 */
exports.getUserNotifications = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('notifications');
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      count: user.notifications ? user.notifications.length : 0,
      data: user.notifications || []
    });
  } catch (error) {
    console.error('Error getting user notifications:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get user notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Mark notification as read
 * @route   PUT /api/users/me/notifications/:id/read
 * @access  Private
 */
exports.markNotificationRead = async (req, res) => {
  try {
    const notificationId = req.params.id;
    
    // Find user and update notification
    const user = await User.findOneAndUpdate(
      { 
        _id: req.user.id,
        'notifications._id': notificationId
      },
      {
        $set: { 'notifications.$.read': true }
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User or notification not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to mark notification as read',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Delete notification
 * @route   DELETE /api/users/me/notifications/:id
 * @access  Private
 */
exports.deleteNotification = async (req, res) => {
  try {
    const notificationId = req.params.id;
    
    // Find user and pull notification from array
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $pull: { notifications: { _id: notificationId } }
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete notification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update user role
 * @route   PUT /api/users/:id/role
 * @access  Private/Admin
 */
exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    
    // Validate role
    if (!role || !['client', 'admin'].includes(role)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid role. Role must be either client or admin'
      });
    }
    
    // Find user
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Prevent changing own role
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({
        status: 'error',
        message: 'You cannot change your own role'
      });
    }
    
    // Update role
    user.role = role;
    await user.save();
    
    res.status(200).json({
      status: 'success',
      message: 'User role updated successfully',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update user role',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get user statistics
 * @route   GET /api/users/stats
 * @access  Private/Admin
 */
exports.getUserStats = async (req, res) => {
  try {
    // Get total user count
    const totalUsers = await User.countDocuments();
    
    // Get count by role
    const clientCount = await User.countDocuments({ role: 'client' });
    const adminCount = await User.countDocuments({ role: 'admin' });
    
    // Get count by active status
    const activeUsers = await User.countDocuments({ isActive: true });
    const inactiveUsers = await User.countDocuments({ isActive: false });
    
    // Get new users in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const newUsers = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });
    
    res.status(200).json({
      status: 'success',
      data: {
        totalUsers,
        byRole: {
          client: clientCount,
          admin: adminCount
        },
        byStatus: {
          active: activeUsers,
          inactive: inactiveUsers
        },
        newUsersLast30Days: newUsers
      }
    });
  } catch (error) {
    console.error('Error getting user stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get user statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Bulk import users
 * @route   POST /api/users/bulk-import
 * @access  Private/Admin
 */
exports.bulkImportUsers = async (req, res) => {
  try {
    const { users } = req.body;
    
    // Validate input
    if (!users || !Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide an array of users to import'
      });
    }
    
    // Track import results
    const results = {
      total: users.length,
      successful: 0,
      failed: 0,
      errors: []
    };
    
    // Process each user
    for (const userData of users) {
      try {
        // Basic validation
        if (!userData.name || !userData.email || !userData.password) {
          results.failed++;
          results.errors.push({
            email: userData.email || 'Unknown',
            error: 'Missing required fields (name, email, or password)'
          });
          continue;
        }
        
        // Check if user already exists
        const existingUser = await User.findOne({ email: userData.email });
        if (existingUser) {
          results.failed++;
          results.errors.push({
            email: userData.email,
            error: 'User with this email already exists'
          });
          continue;
        }
        
        // Create new user
        const user = new User({
          name: userData.name,
          email: userData.email,
          password: userData.password,
          phone: userData.phone || '',
          role: userData.role || 'client'
        });
        
        await user.save();
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          email: userData.email || 'Unknown',
          error: error.message
        });
      }
    }
    
    res.status(200).json({
      status: 'success',
      message: `Successfully imported ${results.successful} out of ${results.total} users`,
      data: results
    });
  } catch (error) {
    console.error('Error importing users:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to import users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Search users
 * @route   GET /api/users/search
 * @access  Private/Admin
 */
exports.searchUsers = async (req, res) => {
  try {
    const { query, role, isActive, limit = 10 } = req.query;
    
    // Build search filter
    const filter = {};
    
    // Add text search if query provided
    if (query) {
      filter.$or = [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } }
      ];
    }
    
    // Add role filter if provided
    if (role) {
      filter.role = role;
    }
    
    // Add active status filter if provided
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    // Execute search with limit
    const users = await User.find(filter)
      .select('-password')
      .limit(parseInt(limit, 10))
      .sort({ name: 1 });
    
    res.status(200).json({
      status: 'success',
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to search users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
