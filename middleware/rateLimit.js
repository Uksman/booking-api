const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const config = require('../config/config');

/**
 * Helper to create rate limit options with default values
 * @param {Object} options - Rate limit options
 * @returns {Object} - Rate limit options with defaults
 */
const createLimiterOptions = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes by default
    max = 100, // Limit each IP to 100 requests per windowMs
    message = 'Too many requests, please try again later.',
    statusCode = 429,
    standardHeaders = true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders = false, // Disable the `X-RateLimit-*` headers
    keyGenerator = (req) => req.user ? req.user.id : req.ip,
    skip = (req) => false, // Skip rate limiting for specific requests
    prefix = 'rate-limit:',
    ...rest
  } = options;

  // Check if Redis is configured for distributed rate limiting
  const store = config.redisUrl ? 
    new RedisStore({
      // Redis client options
      redisURL: config.redisUrl,
      prefix: prefix
    }) : undefined;

  return {
    windowMs,
    max,
    message: {
      status: 'error',
      message
    },
    statusCode,
    standardHeaders,
    legacyHeaders,
    keyGenerator,
    skip,
    store,
    ...rest
  };
};

/**
 * General API rate limiter
 * Limits all API requests
 */
exports.apiLimiter = rateLimit(
  createLimiterOptions({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 250, // Limit each IP to 250 requests per windowMs
    message: 'Too many API requests, please try again after 15 minutes',
    prefix: 'rate-limit:api:'
  })
);

/**
 * Authentication rate limiter
 * More restrictive to prevent brute-force attacks
 */
exports.authLimiter = rateLimit(
  createLimiterOptions({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 login/register requests per hour
    message: 'Too many authentication attempts, please try again after an hour',
    prefix: 'rate-limit:auth:'
  })
);

/**
 * Search rate limiter
 * To prevent excessive search operations
 */
exports.searchLimiter = rateLimit(
  createLimiterOptions({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 50, // Limit each IP to 50 search requests per 10 minutes
    message: 'Too many search requests, please try again after 10 minutes',
    prefix: 'rate-limit:search:'
  })
);

/**
 * Booking rate limiter
 * To prevent excessive booking operations
 */
exports.bookingLimiter = rateLimit(
  createLimiterOptions({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit each IP to 20 booking operations per hour
    message: 'Too many booking attempts, please try again after an hour',
    prefix: 'rate-limit:booking:'
  })
);

/**
 * Admin operations rate limiter
 * More generous limits for admin operations
 */
exports.adminLimiter = rateLimit(
  createLimiterOptions({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 500, // Limit each admin to 500 operations per hour
    message: 'Too many admin operations, please try again after an hour',
    prefix: 'rate-limit:admin:',
    // Skip rate limiting for super admins
    skip: (req) => req.user && req.user.role === 'superadmin'
  })
);

/**
 * User-based rate limiter factory
 * Creates a rate limiter based on user IDs rather than IPs
 * @param {Object} options - Rate limit options
 * @returns {Function} - Rate limiter middleware
 */
exports.createUserRateLimiter = (options = {}) => {
  return rateLimit(
    createLimiterOptions({
      ...options,
      keyGenerator: (req) => {
        // Use user ID if authenticated, fallback to IP
        return req.user ? `user:${req.user._id}` : `ip:${req.ip}`;
      }
    })
  );
};

/**
 * Dynamic rate limiter factory
 * Creates a rate limiter with dynamic limits based on user role
 * @returns {Function} - Rate limiter middleware
 */
exports.createDynamicRateLimiter = () => {
  return (req, res, next) => {
    const role = req.user ? req.user.role : 'anonymous';
    
    // Define limits by role
    const limits = {
      'admin': 1000,
      'driver': 300,
      'user': 150,
      'anonymous': 50
    };
    
    // Get appropriate limit or use default
    const max = limits[role] || limits.anonymous;
    
    // Create a limiter with the dynamic limit
    const limiter = rateLimit(
      createLimiterOptions({
        windowMs: 60 * 60 * 1000, // 1 hour window
        max,
        message: `Rate limit exceeded for ${role} role. Please try again later.`,
        prefix: `rate-limit:${role}:`
      })
    );
    
    // Apply the limiter to this request
    limiter(req, res, next);
  };
};

