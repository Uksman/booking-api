const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');
const { protect, authorize } = require('../middleware/auth');
const { routeValidation } = require('../middleware/validation');

/**
 * @route   GET /api/routes
 * @desc    Get all routes with filtering options
 * @access  Public
 */
router.get('/', routeController.getRoutes);

/**
 * @route   GET /api/routes/search
 * @desc    Search routes by source and destination
 * @access  Public
 */
router.get('/search', routeController.searchRoutes);

/**
 * @route   GET /api/routes/popular
 * @desc    Get popular routes based on booking count
 * @access  Public
 */
router.get('/popular', routeController.getPopularRoutes);

/**
 * @route   GET /api/routes/:id
 * @desc    Get single route by ID
 * @access  Public
 */
router.get('/:id', routeController.getRoute);

/**
 * @route   GET /api/routes/:id/availability
 * @desc    Check route availability on a specific date
 * @access  Public
 */
router.get('/:id/availability', routeController.checkRouteAvailability);

/**
 * @route   GET /api/routes/:id/schedule
 * @desc    Get route schedule for a specific date range
 * @access  Public
 */
router.get('/:id/schedule', routeController.getRouteSchedule);

/**
 * @route   POST /api/routes
 * @desc    Create a new route
 * @access  Private/Admin
 */
router.post(
  '/', 
  protect, 
  authorize('admin'), 
  routeValidation, 
  routeController.createRoute
);

/**
 * @route   PUT /api/routes/:id
 * @desc    Update an existing route
 * @access  Private/Admin
 */
router.put(
  '/:id', 
  protect, 
  authorize('admin'), 
  routeValidation, 
  routeController.updateRoute
);

/**
 * @route   DELETE /api/routes/:id
 * @desc    Delete a route
 * @access  Private/Admin
 */
router.delete(
  '/:id', 
  protect, 
  authorize('admin'), 
  routeController.deleteRoute
);

module.exports = router;

