const express = require('express');
const router = express.Router();

// Import controllers
const bookingController = require('../controllers/bookingController');

// Import middleware
const { protect, authorize, checkOwnership } = require('../middleware/auth');
const { bookingValidation } = require('../middleware/validation');
const { bookingLimiter } = require('../middleware/rateLimit');
const { requireFeature } = require('../middleware/apiVersion');
const { clearCache } = require('../middleware/cache');

/**
 * @route   GET /api/bookings
 * @desc    Get all bookings (with filtering) - Admin only
 * @access  Private/Admin
 */
router.get(
  '/',
  protect,
  authorize('admin'),
  bookingController.getBookings
);

/**
 * @route   GET /api/bookings/me
 * @desc    Get all bookings for the current user
 * @access  Private
 */
router.get(
  '/me',
  protect,
  bookingController.getUserBookings
);

/**
 * @route   GET /api/bookings/stats
 * @desc    Get booking statistics
 * @access  Private/Admin
 */
router.get(
  '/stats',
  protect,
  authorize('admin'),
  requireFeature('route-analytics'),
  bookingController.getBookingStats
);

/**
 * @route   GET /api/bookings/search
 * @desc    Search bookings - Admin only
 * @access  Private/Admin
 */
router.get(
  '/search',
  protect,
  authorize('admin'),
  bookingController.searchBookings
);

/**
 * @route   GET /api/bookings/:id
 * @desc    Get booking by ID
 * @access  Private (own booking or admin)
 */
router.get(
  '/:id',
  protect,
  checkOwnership(req => bookingController.getBookingUserId(req.params.id)),
  bookingController.getBooking
);

/**
 * @route   POST /api/bookings
 * @desc    Create a new booking
 * @access  Private
 */
router.post(
  '/',
  bookingLimiter,
  protect,
  bookingValidation,
  clearCache(['api/buses', 'api/routes']), // Clear cache for related resources
  bookingController.createBooking
);

/**
 * @route   PUT /api/bookings/:id
 * @desc    Update booking
 * @access  Private (admin only for most fields, users can update limited fields)
 */
router.put(
  '/:id',
  protect,
  bookingValidation,
  checkOwnership(req => bookingController.getBookingUserId(req.params.id)),
  clearCache(['api/buses', 'api/routes']), // Clear cache for related resources
  bookingController.updateBooking
);

/**
 * @route   PATCH /api/bookings/:id/status
 * @desc    Update booking status
 * @access  Private/Admin
 */
router.patch(
  '/:id/status',
  protect,
  authorize('admin'),
  clearCache(['api/buses', 'api/routes']), // Clear cache for related resources
  bookingController.updateBookingStatus
);

/**
 * @route   DELETE /api/bookings/:id
 * @desc    Cancel booking
 * @access  Private (own booking or admin)
 */
router.delete(
  '/:id',
  protect,
  checkOwnership(req => bookingController.getBookingUserId(req.params.id)),
  clearCache(['api/buses', 'api/routes']), // Clear cache for related resources
  bookingController.cancelBooking
);

/**
 * @route   POST /api/bookings/:id/payment
 * @desc    Process payment for booking
 * @access  Private (own booking or admin)
 */
router.post(
  '/:id/payment',
  protect,
  bookingLimiter,
  checkOwnership(req => bookingController.getBookingUserId(req.params.id)),
  requireFeature('payment-integration'),
  bookingController.processPayment
);

/**
 * @route   GET /api/bookings/:id/receipt
 * @desc    Get booking receipt
 * @access  Private (own booking or admin)
 */
router.get(
  '/:id/receipt',
  protect,
  checkOwnership(req => bookingController.getBookingUserId(req.params.id)),
  bookingController.getBookingReceipt
);

/**
 * @route   POST /api/bookings/:id/notify
 * @desc    Send booking notification
 * @access  Private/Admin
 */
router.post(
  '/:id/notify',
  protect,
  authorize('admin'),
  requireFeature('real-time-notifications'),
  bookingController.sendBookingNotification
);

module.exports = router;

