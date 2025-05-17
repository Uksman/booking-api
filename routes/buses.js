const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const busController = require('../controllers/busController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

/**
 * @route   GET /api/buses
 * @desc    Get all buses with optional filtering
 * @access  Public
 */
router.get('/', busController.getBuses);

/**
 * @route   GET /api/buses/:id
 * @desc    Get single bus by ID
 * @access  Public
 */
router.get('/:id', busController.getBus);

/**
 * @route   POST /api/buses
 * @desc    Create a new bus
 * @access  Private/Admin
 */
router.post(
          '/',
          [
            auth.protect,
    roleCheck('admin'),
    [
      check('busNumber', 'Bus number is required').not().isEmpty(),
      check('type', 'Bus type is required').not().isEmpty(),
      check('capacity', 'Capacity must be a number greater than 0').isInt({ min: 1 }),
      check('registrationNumber', 'Registration number is required').not().isEmpty(),
      check('manufacturer', 'Manufacturer is required').not().isEmpty(),
      check('model', 'Model is required').not().isEmpty(),
      check('yearOfManufacture', 'Year of manufacture must be a valid year').isInt({ min: 1950, max: new Date().getFullYear() }),
      check('seatingArrangement.rows', 'Number of rows must be a positive integer').isInt({ min: 1 }),
      check('seatingArrangement.columns', 'Number of columns must be a positive integer').isInt({ min: 1 })
    ]
  ],
  busController.createBus
);

/**
 * @route   PUT /api/buses/:id
 * @desc    Update a bus
 * @access  Private/Admin
 */
router.put(
          '/:id',
          [
            auth.protect,
    roleCheck('admin'),
    [
      check('busNumber', 'Bus number must be valid if provided').optional(),
      check('type', 'Bus type must be valid if provided').optional().isIn(['Standard', 'Luxury', 'Mini', 'Double-Decker', 'Sleeper']),
      check('capacity', 'Capacity must be a number greater than 0 if provided').optional().isInt({ min: 1 }),
      check('registrationNumber', 'Registration number must be valid if provided').optional(),
      check('status', 'Status must be valid if provided').optional().isIn(['Active', 'Maintenance', 'Out of Service', 'Reserved'])
    ]
  ],
  busController.updateBus
);

/**
 * @route   DELETE /api/buses/:id
 * @desc    Delete a bus
 * @access  Private/Admin
 */
router.delete(
          '/:id',
          [auth.protect, roleCheck('admin')],
  busController.deleteBus
);

/**
 * @route   GET /api/buses/:id/availability
 * @desc    Check bus availability for a specific date range
 * @access  Public
 */
router.get(
  '/:id/availability',
  [
    check('startDate', 'Start date is required').exists(),
    check('endDate', 'End date is required').exists()
  ],
  busController.checkBusAvailability
);

/**
 * @route   GET /api/buses/:id/schedule
 * @desc    Get bus schedule for a specific date range
 * @access  Public
 */
router.get('/:id/schedule', busController.getBusSchedule);

module.exports = router;

