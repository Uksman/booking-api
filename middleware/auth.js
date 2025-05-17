const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config/config');

/**
 * Middleware to protect routes that require authentication
 * Verifies the JWT token and attaches the user to the request object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check if token exists in Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      // Get token from header (Bearer <token>)
      token = req.headers.authorization.split(' ')[1];
    } 
    // Check if token exists in cookies (for web clients)
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // Check if token exists
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authorized to access this route'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, config.jwtSecret);

      // Check if user still exists
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return res.status(401).json({
          status: 'error',
          message: 'The user belonging to this token no longer exists'
        });
      }

      // Check if user changed password after token was issued
      if (user.passwordChangedAt && decoded.iat) {
        const changedTimestamp = parseInt(
          user.passwordChangedAt.getTime() / 1000,
          10
        );

        // If password was changed after token was issued
        if (changedTimestamp > decoded.iat) {
          return res.status(401).json({
            status: 'error',
            message: 'User recently changed password. Please log in again'
          });
        }
      }

      // Check if user account is active
      if (!user.isActive) {
        return res.status(401).json({
          status: 'error',
          message: 'Your account has been deactivated. Please contact support.'
        });
      }

      // Add user to request object
      req.user = user;
      next();
    } catch (error) {
      // Handle token verification errors
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid token. Please log in again.'
        });
      } else if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          status: 'error',
          message: 'Your token has expired. Please log in again.'
        });
      } else {
        throw error; // Pass other errors to the general error handler
      }
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'An error occurred during authentication',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Middleware to restrict access to specific user roles
 * Must be used after the protect middleware
 * @param {...String} roles - Roles that are allowed to access the route
 * @returns {Function} - Express middleware function
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    // Check if user exists (protect middleware should add it)
    if (!req.user) {
      return res.status(500).json({
        status: 'error',
        message: 'Authorization middleware used without authentication'
      });
    }

    // Check if user has the required role
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: `User role '${req.user.role}' is not authorized to access this route`
      });
    }

    next();
  };
};

/**
 * Middleware to check if the user owns the resource or is an admin
 * Must be used after the protect middleware
 * @param {Function} getUserIdFromResource - Function to extract user ID from the resource
 * @returns {Function} - Express middleware function
 */
exports.checkOwnership = (getUserIdFromResource) => {
  return async (req, res, next) => {
    try {
      // Skip for admins - they can access any resource
      if (req.user.role === 'admin') {
        return next();
      }

      // Get user ID from the resource
      const resourceUserId = await getUserIdFromResource(req);

      // If no user ID was found, or it doesn't match the current user
      if (!resourceUserId || resourceUserId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          status: 'error',
          message: 'You are not authorized to access this resource'
        });
      }

      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      return res.status(500).json({
        status: 'error',
        message: 'An error occurred while checking resource ownership',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

/**
 * Middleware to refresh the JWT token if it's about to expire
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.refreshToken = (req, res, next) => {
  if (!req.user) {
    return next();
  }

  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.decode(token);

    // Check if token will expire soon (within 1 hour)
    const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
    if (expiresIn > 3600) {
      return next();
    }

    // Generate a new token
    const newToken = jwt.sign(
      { id: req.user._id, role: req.user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    // Set the new token in the response header
    res.setHeader('New-Token', newToken);
    
    // Also set it as a cookie for web clients
    if (config.secureCookies) {
      res.cookie('token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: config.jwtExpiresIn * 1000
      });
    }

    next();
  } catch (error) {
    // If there's an error refreshing the token, just continue
    console.error('Token refresh error:', error);
    next();
  }
};

