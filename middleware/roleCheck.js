/**
 * Middleware to check user's role for access control
 * @param {string|Array} roles - Roles that are allowed to access the route
 * @returns {function} - Express middleware
 */
const roleCheck = (roles) => {
  return (req, res, next) => {
    // Make sure user exists and has a role
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        status: 'error',
        message: 'Not authorized to access this route'
      });
    }

    // Check if user's role is in the allowed roles
    // Convert roles parameter to array if it's a string
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }

    next();
  };
};

module.exports = roleCheck;

