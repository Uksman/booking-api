const semver = require('semver');
const config = require('../config/config');

// Define API versions and their details
const API_VERSIONS = {
  '1.0.0': {
    status: 'stable',
    releaseDate: '2025-01-01',
    endOfLife: '2026-01-01',
    breaking: false
  },
  '1.1.0': {
    status: 'stable',
    releaseDate: '2025-03-15',
    endOfLife: '2026-03-15',
    breaking: false
  },
  '2.0.0': {
    status: 'beta',
    releaseDate: '2025-05-01',
    endOfLife: null,
    breaking: true,
    breakingChanges: [
      'Changed booking creation response structure',
      'Removed legacy authentication endpoints',
      'Route search parameters now use camelCase'
    ]
  }
};

// Get the latest stable version
const LATEST_STABLE_VERSION = Object.entries(API_VERSIONS)
  .filter(([_, details]) => details.status === 'stable')
  .sort(([versionA], [versionB]) => semver.compare(versionB, versionA))[0]?.[0] || '1.0.0';

// Get the latest version (including non-stable)
const LATEST_VERSION = Object.keys(API_VERSIONS)
  .sort((a, b) => semver.compare(b, a))[0] || '1.0.0';

// Default version to use if none specified
const DEFAULT_VERSION = config.defaultApiVersion || LATEST_STABLE_VERSION;

/**
 * Feature availability by version
 * Maps features to the minimum version required
 */
const FEATURE_VERSIONS = {
  'route-scheduling': '1.0.0',
  'bus-tracking': '1.0.0',
  'booking-management': '1.0.0',
  'user-profiles': '1.0.0',
  'payment-integration': '1.1.0',
  'route-analytics': '1.1.0',
  'advanced-search': '1.1.0',
  'real-time-notifications': '2.0.0',
  'fare-calculator': '2.0.0',
  'user-reviews': '2.0.0',
  'group-bookings': '2.0.0'
};

/**
 * Extract API version from various sources
 * Checks URL path, headers, and query parameters
 * @param {Object} req - Express request object
 * @returns {String} - API version
 */
function extractVersion(req) {
  let version = null;
  
  // Check URL path for version (e.g., /v1/routes, /api/v2/users)
  const urlVersionRegex = /\/v(\d+)(?:\.(\d+))?(?:\.(\d+))?/;
  const urlVersionMatch = req.originalUrl.match(urlVersionRegex);
  
  if (urlVersionMatch) {
    const major = urlVersionMatch[1] || '0';
    const minor = urlVersionMatch[2] || '0';
    const patch = urlVersionMatch[3] || '0';
    version = `${major}.${minor}.${patch}`;
  }
  
  // If URL doesn't have version, check API-Version header
  if (!version && req.headers['api-version']) {
    version = req.headers['api-version'];
  }
  
  // If still no version, check Accept header with version parameter
  if (!version && req.headers.accept) {
    const acceptHeaderRegex = /application\/vnd\.busapi\.v(\d+)(?:\.(\d+))?(?:\.(\d+))?/;
    const acceptVersionMatch = req.headers.accept.match(acceptHeaderRegex);
    
    if (acceptVersionMatch) {
      const major = acceptVersionMatch[1] || '0';
      const minor = acceptVersionMatch[2] || '0';
      const patch = acceptVersionMatch[3] || '0';
      version = `${major}.${minor}.${patch}`;
    }
  }
  
  // If still no version, check query parameter
  if (!version && req.query.version) {
    version = req.query.version;
  }
  
  // Normalize and validate the version
  if (version) {
    // Convert shorthand versions (e.g., "1", "2.0") to semver format
    if (/^\d+$/.test(version)) {
      version = `${version}.0.0`;
    } else if (/^\d+\.\d+$/.test(version)) {
      version = `${version}.0`;
    }
    
    // Check if it's a valid semver
    if (!semver.valid(version)) {
      // Invalid version, use default
      return DEFAULT_VERSION;
    }
    
    // Find the closest supported version
    const supportedVersions = Object.keys(API_VERSIONS);
    const matchingVersion = supportedVersions.find(v => v === version);
    
    if (matchingVersion) {
      return matchingVersion;
    }
    
    // Find the closest lower version
    const lowerVersions = supportedVersions
      .filter(v => semver.lte(v, version))
      .sort((a, b) => semver.compare(b, a));
    
    if (lowerVersions.length > 0) {
      return lowerVersions[0];
    }
    
    // If no lower version found, use the lowest available version
    return supportedVersions.sort((a, b) => semver.compare(a, b))[0];
  }
  
  // No version specified, use default
  return DEFAULT_VERSION;
}

/**
 * Check if a feature is available in the specified version
 * @param {String} feature - Feature identifier
 * @param {String} version - API version
 * @returns {Boolean} - Whether the feature is available
 */
function isFeatureAvailable(feature, version) {
  const requiredVersion = FEATURE_VERSIONS[feature];
  
  if (!requiredVersion) {
    // Unknown feature, assume not available
    return false;
  }
  
  return semver.gte(version, requiredVersion);
}

/**
 * Generate deprecation and sunset headers
 * @param {String} version - API version
 * @param {Object} res - Express response object
 */
function addVersionHeaders(version, res) {
  const versionDetails = API_VERSIONS[version];
  
  if (!versionDetails) return;
  
  // Add basic version info header
  res.set('API-Version', version);
  res.set('API-Latest-Version', LATEST_VERSION);
  
  // Add documentation header
  res.set('API-Documentation', `${config.baseUrl}/docs/api/v${version.split('.')[0]}`);
  
  // Add deprecated header if needed
  if (versionDetails.status === 'deprecated') {
    res.set('Deprecation', versionDetails.releaseDate);
    
    if (versionDetails.endOfLife) {
      // Add sunset header if end-of-life date is specified
      const sunsetDate = new Date(versionDetails.endOfLife);
      res.set('Sunset', sunsetDate.toUTCString());
      
      // Calculate days until sunset
      const daysUntilSunset = Math.ceil((sunsetDate - new Date()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilSunset > 0) {
        res.set('API-Deprecation-Info', 
          `This API version will be sunset in ${daysUntilSunset} days. Please upgrade to version ${LATEST_STABLE_VERSION}.`);
      } else {
        res.set('API-Deprecation-Info', 
          `This API version is no longer supported. Please upgrade to version ${LATEST_STABLE_VERSION}.`);
      }
    }
  }
  
  // Add breaking changes warning if applicable
  if (versionDetails.breaking) {
    res.set('API-Breaking-Changes', 'true');
    
    if (versionDetails.breakingChanges && versionDetails.breakingChanges.length > 0) {
      res.set('API-Breaking-Changes-Info', versionDetails.breakingChanges.join('; '));
    }
  }
}

/**
 * API version middleware
 * Detects and sets API version for the request
 * @returns {Function} - Express middleware
 */
exports.detectVersion = () => {
  return (req, res, next) => {
    // Extract and set API version
    const version = extractVersion(req);
    req.apiVersion = version;
    
    // Add version to response headers
    addVersionHeaders(version, res);
    
    // Add helper method to check feature availability
    req.isFeatureAvailable = (feature) => isFeatureAvailable(feature, version);
    
    next();
  };
};

/**
 * Version-specific routing middleware
 * Routes requests to different handlers based on API version
 * @param {Object} handlers - Map of version handlers
 * @returns {Function} - Express middleware
 */
exports.versionRouter = (handlers) => {
  return (req, res, next) => {
    const version = req.apiVersion || DEFAULT_VERSION;
    
    // Try to find an exact version match
    if (handlers[version]) {
      return handlers[version](req, res, next);
    }
    
    // Try to find the closest major version
    const majorVersion = version.split('.')[0];
    const majorVersionKey = Object.keys(handlers)
      .find(key => key.startsWith(`${majorVersion}.`));
    
    if (majorVersionKey) {
      return handlers[majorVersionKey](req, res, next);
    }
    
    // Fall back to default handler
    if (handlers.default) {
      return handlers.default(req, res, next);
    }
    
    // No suitable handler found
    next();
  };
};

/**
 * Version deprecation middleware
 * Adds deprecation warnings for outdated API versions
 * @returns {Function} - Express middleware
 */
exports.deprecationCheck = () => {
  return (req, res, next) => {
    const version = req.apiVersion || DEFAULT_VERSION;
    const versionDetails = API_VERSIONS[version];
    
    if (!versionDetails) return next();
    
    // Check if version is deprecated
    if (versionDetails.status === 'deprecated') {
      // Add deprecated warning to response
      const warning = `API version ${version} is deprecated.`;
      res.set('Warning', `299 - "${warning}"`);
      
      // Check if already past end-of-life
      if (versionDetails.endOfLife && new Date(versionDetails.endOfLife) < new Date()) {
        return res.status(410).json({
          status: 'error',
          message: `API version ${version} has reached end-of-life and is no longer supported.`,
          suggestedVersion: LATEST_STABLE_VERSION,
          documentationUrl: `${config.baseUrl}/docs/api/v${LATEST_STABLE_VERSION.split('.')[0]}`
        });
      }
    }
    
    next();
  };
};

/**
 * Feature availability middleware
 * Checks if requested feature is available in current API version
 * @param {String} feature - Feature identifier
 * @returns {Function} - Express middleware
 */
exports.requireFeature = (feature) => {
  return (req, res, next) => {
    const version = req.apiVersion || DEFAULT_VERSION;
    
    if (!isFeatureAvailable(feature, version)) {
      return res.status(400).json({
        status: 'error',
        message: `The requested feature '${feature}' is not available in API version ${version}.`,
        minimumVersion: FEATURE_VERSIONS[feature],
        currentVersion: version,
        suggestedVersion: LATEST_STABLE_VERSION
      });
    }
    
    next();
  };
};

/**
 * Add version-specific response formatting
 * Formats response based on API version
 * @returns {Function} - Express middleware
 */
exports.versionedResponse = () => {
  return (req, res, next) => {
    const version = req.apiVersion || DEFAULT_VERSION;
    const originalJson = res.json;
    
    // Override the json method
    res.json = function(body) {
      let responseBody = body;
      
      // Skip formatting for error responses
      if (body && body.status === 'error') {
        return originalJson.call(this, responseBody);
      }
      
      // Format response based on API version
      if (semver.lt(version, '2.0.0')) {
        // Legacy format (v1.x.x)
        if (typeof body === 'object' && !Array.isArray(body)) {
          responseBody = {
            status: 'success',
            ...body
          };
        } else {
          responseBody = {
            status: 'success',
            data: body
          };
        }
      } else {
        // Modern format (v2.x.x and above)
        if (typeof body === 'object' && !Array.isArray(body) && !body.status) {
          responseBody = {
            status: 'success',
            data: body
          };
        }
      }
      
      return originalJson.call(this, responseBody);
    };
    
    next();
  };
};

// Export version information for use in other modules
exports.versions = {
  DEFAULT_VERSION,
  LATEST_VERSION,
  LATEST_STABLE_VERSION,
  API_VERSIONS,
  FEATURE_VERSIONS
};

