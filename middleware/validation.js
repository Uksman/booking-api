const { body, check, param, validationResult } = require('express-validator');
const mongoose = require('mongoose');

/**
 * Helper function to validate MongoDB ObjectId
 * @param {string} value - The ObjectId to validate
 * @returns {boolean} - Whether the ObjectId is valid
 */
const isValidObjectId = (value) => {
  return value ? mongoose.Types.ObjectId.isValid(value) : true;
};

/**
 * Middleware to handle validation errors
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

/**
 * Validation rules for routes
 */
exports.routeValidation = [
  body('routeNumber').trim().notEmpty().withMessage('Route number is required'),
  body('source').trim().notEmpty().withMessage('Source location is required'),
  body('destination').trim().notEmpty().withMessage('Destination location is required')
    .custom((value, { req }) => {
      return value !== req.body.source;
    }).withMessage('Destination must be different from source'),
  body('distance').isNumeric().withMessage('Distance must be a number')
    .custom(value => value > 0).withMessage('Distance must be greater than 0'),
  body('departureTime').isISO8601().withMessage('Departure time must be a valid date/time'),
  body('arrivalTime').isISO8601().withMessage('Arrival time must be a valid date/time')
    .custom((value, { req }) => {
      if (req.body.departureTime && value) {
        const departureTime = new Date(req.body.departureTime);
        const arrivalTime = new Date(value);
        return arrivalTime > departureTime;
      }
      return true;
    }).withMessage('Arrival time must be after departure time'),
  body('daysOfOperation').isArray().withMessage('Days of operation must be an array'),
  body('daysOfOperation.*').isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    .withMessage('Invalid day of operation'),
  body('bus').optional().custom(isValidObjectId).withMessage('Invalid bus ID format'),
  body('fare.adult').isNumeric().withMessage('Adult fare must be a number')
    .custom(value => value >= 0).withMessage('Adult fare cannot be negative'),
  body('fare.child').optional().isNumeric().withMessage('Child fare must be a number')
    .custom(value => value >= 0).withMessage('Child fare cannot be negative'),
  body('fare.student').optional().isNumeric().withMessage('Student fare must be a number')
    .custom(value => value >= 0).withMessage('Student fare cannot be negative'),
  body('fare.senior').optional().isNumeric().withMessage('Senior fare must be a number')
    .custom(value => value >= 0).withMessage('Senior fare cannot be negative'),
  body('status').optional().isIn(['Active', 'Inactive', 'Seasonal', 'Discontinued'])
    .withMessage('Invalid route status'),
  body('regularity').optional().isIn(['Daily', 'Weekdays', 'Weekends', 'Weekly', 'Monthly', 'Custom'])
    .withMessage('Invalid regularity value'),
  body('stops').optional().isArray().withMessage('Stops must be an array'),
  body('stops.*.name').optional().trim().notEmpty().withMessage('Stop name is required'),
  body('stops.*.coordinates.latitude').optional().isFloat().withMessage('Latitude must be a valid float'),
  body('stops.*.coordinates.longitude').optional().isFloat().withMessage('Longitude must be a valid float')
];

/**
 * Validation rules for buses
 */
exports.busValidation = [
  body('busNumber').trim().notEmpty().withMessage('Bus number is required'),
  body('registrationNumber').trim().notEmpty().withMessage('Registration number is required'),
  body('type').isIn(['Standard', 'Luxury', 'Mini', 'Double-Decker', 'Sleeper'])
    .withMessage('Invalid bus type'),
  body('capacity').isInt({ min: 1 }).withMessage('Capacity must be a positive integer'),
  body('manufacturer').trim().notEmpty().withMessage('Manufacturer is required'),
  body('model').trim().notEmpty().withMessage('Model is required'),
  body('year').isInt({ min: 1950, max: new Date().getFullYear() + 1 })
    .withMessage(`Year must be between 1950 and ${new Date().getFullYear() + 1}`),
  body('status').optional().isIn(['Active', 'Maintenance', 'Repair', 'Retired'])
    .withMessage('Invalid bus status'),
  body('amenities').optional().isArray().withMessage('Amenities must be an array'),
  body('amenities.*').optional().isString().withMessage('Each amenity must be a string'),
  body('seatingArrangement.rows').optional().isInt({ min: 1 }).withMessage('Rows must be a positive integer'),
  body('seatingArrangement.columns').optional().isInt({ min: 1 }).withMessage('Columns must be a positive integer')
];

/**
 * Validation rules for bookings
 */
exports.bookingValidation = [
  body('user').custom(isValidObjectId).withMessage('Invalid user ID format'),
  body('route').custom(isValidObjectId).withMessage('Invalid route ID format'),
  body('bus').custom(isValidObjectId).withMessage('Invalid bus ID format'),
  body('departureDate').isISO8601().withMessage('Departure date must be a valid date/time'),
  body('returnDate').optional().isISO8601()
    .custom((value, { req }) => {
      if (req.body.departureDate && value) {
        const departureDate = new Date(req.body.departureDate);
        const returnDate = new Date(value);
        return returnDate > departureDate;
      }
      return true;
    }).withMessage('Return date must be after departure date'),
  body('bookingType').isIn(['One-Way', 'Round-Trip']).withMessage('Invalid booking type'),
  body('passengers').isArray().withMessage('Passengers must be an array')
    .custom(value => value.length > 0).withMessage('At least one passenger is required'),
  body('passengers.*.name').notEmpty().withMessage('Passenger name is required'),
  body('passengers.*.age').isInt({ min: 0, max: 120 }).withMessage('Age must be between 0 and 120'),
  body('passengers.*.seatNumber').notEmpty().withMessage('Seat number is required'),
  body('passengers.*.gender').optional().isIn(['Male', 'Female', 'Other']).withMessage('Invalid gender'),
  body('passengers.*.passengerType').optional().isIn(['Adult', 'Child', 'Student', 'Senior'])
    .withMessage('Invalid passenger type'),
  body('totalFare').isNumeric().withMessage('Total fare must be a number')
    .custom(value => value >= 0).withMessage('Total fare cannot be negative')
];

/**
 * Validation rules for hiring
 */
exports.hiringValidation = [
  body('user').custom(isValidObjectId).withMessage('Invalid user ID format'),
  body('bus').custom(isValidObjectId).withMessage('Invalid bus ID format'),
  body('startDate').isISO8601().withMessage('Start date must be a valid date/time'),
  body('endDate').isISO8601()
    .custom((value, { req }) => {
      if (req.body.startDate && value) {
        const startDate = new Date(req.body.startDate);
        const endDate = new Date(value);
        return endDate > startDate;
      }
      return true;
    }).withMessage('End date must be after start date'),
  body('pickupLocation').notEmpty().withMessage('Pickup location is required'),
  body('dropoffLocation').notEmpty().withMessage('Dropoff location is required'),
  body('purpose').notEmpty().withMessage('Purpose is required'),
  body('passengerCount').isInt({ min: 1 }).withMessage('Passenger count must be a positive integer'),
  body('contactPerson').notEmpty().withMessage('Contact person is required'),
  body('contactPhone').notEmpty().withMessage('Contact phone is required'),
  body('totalAmount').isNumeric().withMessage('Total amount must be a number')
    .custom(value => value >= 0).withMessage('Total amount cannot be negative')
];

/**
 * Validation rules for users
 */
exports.userValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please include a valid email')
    .normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('phone').optional().isMobilePhone().withMessage('Please include a valid phone number'),
  body('role').optional().isIn(['user', 'admin', 'driver']).withMessage('Invalid role')
];

/**
 * Validation rules for password reset
 */
exports.passwordResetValidation = [
  body('email').isEmail().withMessage('Please include a valid email')
    .normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('confirmPassword').custom((value, { req }) => {
    return value === req.body.password;
  }).withMessage('Passwords do not match')
];

/**
 * ID validation middleware factory
 * @param {string} paramName - The parameter name containing the ID
 * @param {string} modelName - Human-readable name of the model for error message
 * @returns {Array} - Express-validator middleware array
 */
exports.validateId = (paramName = 'id', modelName = 'resource') => [
  param(paramName)
    .custom(isValidObjectId)
    .withMessage(`Invalid ${modelName} ID format`)
];

