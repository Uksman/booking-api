const express = require('express');
const router = express.Router();

// Import controllers
const userController = require('../controllers/userController');

// Import middleware
const { protect, authorize, checkOwnership } = require('../middleware/auth');
const { userValidation, passwordResetValidation } = require('../middleware/validation');
const { apiLimiter, authLimiter } = require('../middleware/rateLimit');
const { clearCache } = require('../middleware/cache');

/**
 * @route   GET /api/users
 * @desc    Get all users (with pagination and filtering)
 * @access  Private/Admin
 */
router.get(
  '/',
  protect,
  authorize('admin'),
  userController.getUsers
);

/**
 * @route   GET /api/users/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get(
  '/me',
  protect,
  userController.getCurrentUser
);

/**
 * @route   PUT /api/users/me
 * @desc    Update current user profile
 * @access  Private
 */
router.put(
  '/me',
  protect,
  userValidation,
  userController.updateCurrentUser
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private/Admin
 */
router.get(
  '/:id',
  protect,
  authorize('admin'),
  userController.getUserById
);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Private/Admin
 */
router.put(
  '/:id',
  protect,
  authorize('admin'),
  userValidation,
  userController.updateUser
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 * @access  Private/Admin
 */
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  userController.deleteUser
);

/**
 * @route   POST /api/users/:id/activate
 * @desc    Activate user account
 * @access  Private/Admin
 */
router.post(
  '/:id/activate',
  protect,
  authorize('admin'),
  userController.activateUser
);

/**
 * @route   POST /api/users/:id/deactivate
 * @desc    Deactivate user account
 * @access  Private/Admin
 */
router.post(
  '/:id/deactivate',
  protect,
  authorize('admin'),
  userController.deactivateUser
);

/**
 * Password management routes - apply rate limiting to prevent brute force
 */

/**
 * @route   PUT /api/users/me/password
 * @desc    Change current user password
 * @access  Private
 */
router.put(
  '/me/password',
  authLimiter,
  protect,
  passwordResetValidation,
  userController.changePassword
);

/**
 * @route   POST /api/users/forgot-password
 * @desc    Request password reset (send reset email)
 * @access  Public
 */
router.post(
  '/forgot-password',
  authLimiter,
  userController.forgotPassword
);

/**
 * @route   POST /api/users/reset-password/:token
 * @desc    Reset password using token
 * @access  Public
 */
router.post(
  '/reset-password/:token',
  authLimiter,
  passwordResetValidation,
  userController.resetPassword
);

/**
 * User preferences routes
 */

/**
 * @route   GET /api/users/me/preferences
 * @desc    Get user preferences
 * @access  Private
 */
router.get(
  '/me/preferences',
  protect,
  userController.getUserPreferences
);

/**
 * @route   PUT /api/users/me/preferences
 * @desc    Update user preferences
 * @access  Private
 */
router.put(
  '/me/preferences',
  protect,
  userController.updateUserPreferences
);

/**
 * Admin-specific user management routes
 */

/**
 * @route   POST /api/users/
 * @desc    Create new user (admin only)
 * @access  Private/Admin
 */
router.post(
  '/',
  protect,
  authorize('admin'),
  userValidation,
  userController.createUser
);

/**
 * @route   PUT /api/users/:id/role
 * @desc    Update user role
 * @access  Private/Admin
 */
router.put(
  '/:id/role',
  protect,
  authorize('admin'),
  userController.updateUserRole
);

/**
 * @route   GET /api/users/stats
 * @desc    Get user statistics
 * @access  Private/Admin
 */
router.get(
  '/stats',
  protect,
  authorize('admin'),
  userController.getUserStats
);

/**
 * @route   POST /api/users/bulk-import
 * @desc    Bulk import users
 * @access  Private/Admin
 */
router.post(
  '/bulk-import',
  protect,
  authorize('admin'),
  userController.bulkImportUsers
);

/**
 * @route   GET /api/users/search
 * @desc    Search users
 * @access  Private/Admin
 */
router.get(
  '/search',
  protect,
  authorize('admin'),
  userController.searchUsers
);

/**
 * @route   GET /api/users/me/notifications
 * @desc    Get user notifications
 * @access  Private
 */
router.get(
  '/me/notifications',
  protect,
  userController.getUserNotifications
);

/**
 * @route   PUT /api/users/me/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put(
  '/me/notifications/:id/read',
  protect,
  userController.markNotificationRead
);

/**
 * @route   DELETE /api/users/me/notifications/:id
 * @desc    Delete notification
 * @access  Private
 */
router.delete(
  '/me/notifications/:id',
  protect,
  userController.deleteNotification
);

module.exports = router;

