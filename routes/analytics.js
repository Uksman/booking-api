const express = require('express');
const router = express.Router();

// Import controllers
const analyticsController = require('../controllers/analyticsController');

// Import middleware
const { protect, authorize } = require('../middleware/auth');
const { requireFeature } = require('../middleware/apiVersion');
const { serverCache } = require('../middleware/cache');

// All routes in this file require admin access
router.use(protect, authorize('admin'), requireFeature('route-analytics'));

/**
 * @route   GET /api/analytics/dashboard
 * @desc    Get overview statistics for admin dashboard
 * @access  Private/Admin
 */
router.get(
  '/dashboard',
  serverCache({ ttl: 300 }), // 5-minute cache for dashboard data
  analyticsController.getDashboardStats
);

/**
 * @route   GET /api/analytics/bookings
 * @desc    Get booking statistics
 * @access  Private/Admin
 */
router.get(
  '/bookings',
  serverCache({ ttl: 300 }), // 5-minute cache
  analyticsController.getBookingStats
);

/**
 * @route   GET /api/analytics/revenue
 * @desc    Get revenue reports
 * @access  Private/Admin
 */
router.get(
  '/revenue',
  serverCache({ ttl: 300 }), // 5-minute cache
  analyticsController.getRevenueReports
);

/**
 * @route   GET /api/analytics/routes
 * @desc    Get route popularity and performance metrics
 * @access  Private/Admin
 */
router.get(
  '/routes',
  serverCache({ ttl: 300 }), // 5-minute cache
  analyticsController.getRouteAnalytics
);

/**
 * @route   GET /api/analytics/buses
 * @desc    Get bus utilization and performance metrics
 * @access  Private/Admin
 */
router.get(
  '/buses',
  serverCache({ ttl: 300 }), // 5-minute cache
  analyticsController.getBusAnalytics
);

/**
 * @route   GET /api/analytics/users
 * @desc    Get user activity and demographics
 * @access  Private/Admin
 */
router.get(
  '/users',
  serverCache({ ttl: 300 }), // 5-minute cache
  analyticsController.getUserAnalytics
);

/**
 * @route   GET /api/analytics/trends
 * @desc    Get booking and revenue trends over time
 * @access  Private/Admin
 */
router.get(
  '/trends',
  serverCache({ ttl: 300 }), // 5-minute cache
  analyticsController.getTrends
);

/**
 * @route   GET /api/analytics/forecast
 * @desc    Get booking and revenue forecasts
 * @access  Private/Admin
 */
router.get(
  '/forecast',
  serverCache({ ttl: 300 }), // 5-minute cache
  analyticsController.getForecast
);

/**
 * @route   GET /api/analytics/performance
 * @desc    Get system performance metrics
 * @access  Private/Admin
 */
router.get(
  '/performance',
  analyticsController.getPerformanceMetrics
);

// Export endpoints - No caching for export operations

/**
 * @route   GET /api/analytics/export/bookings
 * @desc    Export booking data (CSV, Excel)
 * @access  Private/Admin
 */
router.get(
  '/export/bookings',
  analyticsController.exportBookings
);

/**
 * @route   GET /api/analytics/export/revenue
 * @desc    Export revenue data (CSV, Excel)
 * @access  Private/Admin
 */
router.get(
  '/export/revenue',
  analyticsController.exportRevenue
);

/**
 * @route   GET /api/analytics/export/routes
 * @desc    Export route performance data (CSV, Excel)
 * @access  Private/Admin
 */
router.get(
  '/export/routes',
  analyticsController.exportRoutes
);

/**
 * @route   GET /api/analytics/export/buses
 * @desc    Export bus performance data (CSV, Excel)
 * @access  Private/Admin
 */
router.get(
  '/export/buses',
  analyticsController.exportBuses
);

/**
 * @route   GET /api/analytics/export/users
 * @desc    Export user data (CSV, Excel)
 * @access  Private/Admin
 */
router.get(
  '/export/users',
  analyticsController.exportUsers
);

/**
 * @route   POST /api/analytics/reports/generate
 * @desc    Generate custom report
 * @access  Private/Admin
 */
router.post(
  '/reports/generate',
  analyticsController.generateCustomReport
);

/**
 * @route   GET /api/analytics/reports/:id
 * @desc    Get a saved report
 * @access  Private/Admin
 */
router.get(
  '/reports/:id',
  analyticsController.getReport
);

/**
 * @route   GET /api/analytics/reports
 * @desc    Get list of saved reports
 * @access  Private/Admin
 */
router.get(
  '/reports',
  analyticsController.getReports
);

module.exports = router;

