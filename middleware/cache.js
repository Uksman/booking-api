const crypto = require('crypto');
const Redis = require('ioredis');
const { LRUCache } = require('lru-cache');
const config = require('../config/config');

// Initialize cache stores
let redisClient;
let memoryCache;

// Try to connect to Redis if configured
if (config.redisUrl) {
  try {
    redisClient = new Redis(config.redisUrl, {
      keyPrefix: 'cache:',
      retryStrategy: (times) => {
        // Retry connection with exponential backoff
        return Math.min(times * 50, 2000);
      }
    });
    
    redisClient.on('error', (err) => {
      console.error('Redis cache error:', err);
      if (!memoryCache) {
        // Initialize memory cache as fallback
        initializeMemoryCache();
      }
    });
    
    console.log('Redis cache connected');
  } catch (err) {
    console.error('Redis cache connection failed:', err);
    // Initialize memory cache as fallback
    initializeMemoryCache();
  }
} else {
  // No Redis configured, use memory cache
  initializeMemoryCache();
  console.log('Using memory cache');
}

/**
 * Initialize the in-memory LRU cache
 */
function initializeMemoryCache() {
  memoryCache = new LRUCache({
    max: 500, // Maximum number of items to store
    ttl: 1000 * 60 * 60, // Default TTL: 1 hour
    updateAgeOnGet: true,
    allowStale: false
  });
}

/**
 * Generate a cache key based on the request
 * @param {Object} req - Express request object
 * @param {String} prefix - Optional prefix for the key
 * @returns {String} - Cache key
 */
function generateCacheKey(req, prefix = 'api') {
  const components = [
    prefix,
    req.originalUrl || req.url,
    req.method
  ];
  
  // Add additional components based on request properties
  if (req.user && req.user._id) {
    components.push(`user:${req.user._id}`);
  }
  
  // Add query params to key if they exist and aren't ignored
  const ignoredParams = ['token', 'cache', 'rand', '_'];
  
  if (req.query && Object.keys(req.query).length > 0) {
    const queryParams = Object.keys(req.query)
      .filter(key => !ignoredParams.includes(key))
      .sort()
      .map(key => `${key}=${req.query[key]}`)
      .join('&');
    
    if (queryParams) {
      components.push(`query:${queryParams}`);
    }
  }
  
  // Create a hash of the key components
  return crypto.createHash('md5').update(components.join('|')).digest('hex');
}

/**
 * Generate an ETag for a response
 * @param {*} data - The response data
 * @returns {String} - ETag value
 */
function generateETag(data) {
  if (!data) return null;
  
  let content = '';
  
  if (typeof data === 'object') {
    content = JSON.stringify(data);
  } else {
    content = String(data);
  }
  
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Set a value in the cache
 * @param {String} key - Cache key
 * @param {*} value - Value to cache
 * @param {Number} ttl - Time-to-live in seconds
 * @returns {Promise<Boolean>} - Success indicator
 */
async function setCacheValue(key, value, ttl = 3600) {
  try {
    // Serialize value if it's an object
    const serialized = typeof value === 'object' ? JSON.stringify(value) : value;
    
    if (redisClient && redisClient.status === 'ready') {
      // Use Redis if available
      await redisClient.set(key, serialized, 'EX', ttl);
    } else if (memoryCache) {
      // Fallback to memory cache
      memoryCache.set(key, value, { ttl: ttl * 1000 });
    } else {
      return false;
    }
    return true;
  } catch (error) {
    console.error('Cache set error:', error);
    return false;
  }
}

/**
 * Get a value from the cache
 * @param {String} key - Cache key
 * @returns {Promise<*>} - Cached value or null if not found
 */
async function getCacheValue(key) {
  try {
    if (redisClient && redisClient.status === 'ready') {
      // Use Redis if available
      const result = await redisClient.get(key);
      
      if (result) {
        try {
          // Try to parse as JSON
          return JSON.parse(result);
        } catch (e) {
          // Return as is if not JSON
          return result;
        }
      }
    } else if (memoryCache) {
      // Fallback to memory cache
      return memoryCache.get(key);
    }
    return null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

/**
 * Delete a value from the cache
 * @param {String} key - Cache key
 * @returns {Promise<Boolean>} - Success indicator
 */
async function deleteCacheValue(key) {
  try {
    if (redisClient && redisClient.status === 'ready') {
      // Use Redis if available
      await redisClient.del(key);
    } else if (memoryCache) {
      // Fallback to memory cache
      memoryCache.delete(key);
    } else {
      return false;
    }
    return true;
  } catch (error) {
    console.error('Cache delete error:', error);
    return false;
  }
}

/**
 * Clear all cache values with a specific prefix
 * @param {String} prefix - Key prefix to match
 * @returns {Promise<Boolean>} - Success indicator
 */
async function clearCacheByPrefix(prefix) {
  try {
    if (redisClient && redisClient.status === 'ready') {
      // Use Redis scan to find keys with prefix
      const keys = [];
      let cursor = '0';
      
      do {
        const reply = await redisClient.scan(cursor, 'MATCH', `cache:${prefix}*`, 'COUNT', 100);
        cursor = reply[0];
        keys.push(...reply[1]);
        
        if (keys.length > 1000) {
          console.warn(`Deleting large number of cache keys (${keys.length})`);
        }
      } while (cursor !== '0');
      
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } else if (memoryCache) {
      // Fallback to memory cache - less efficient for prefixes
      const matchingKeys = [];
      
      memoryCache.forEach((value, key, cache) => {
        if (key.startsWith(prefix)) {
          matchingKeys.push(key);
        }
      });
      
      matchingKeys.forEach(key => memoryCache.delete(key));
    } else {
      return false;
    }
    return true;
  } catch (error) {
    console.error('Cache clear by prefix error:', error);
    return false;
  }
}

// Cache route configuration with default TTL in seconds
const cacheConfig = {
  // Public routes - longer cache times
  '/api/routes': 3600, // 1 hour
  '/api/routes/popular': 3600, // 1 hour
  '/api/buses': 3600, // 1 hour
  
  // Semi-dynamic data - medium cache times
  '/api/routes/search': 300, // 5 minutes
  '/api/routes/*/schedule': 600, // 10 minutes
  
  // Dynamic data - shorter cache times
  '/api/routes/*/availability': 60, // 1 minute
  
  // Admin routes - no caching
  '/api/admin': 0
};

/**
 * Determine the cache TTL for a specific path
 * @param {String} path - Request path
 * @returns {Number} - TTL in seconds, 0 means no caching
 */
function getCacheTTL(path) {
  // First check for exact matches
  if (cacheConfig[path] !== undefined) {
    return cacheConfig[path];
  }
  
  // Then check for wildcard pattern matches
  for (const pattern in cacheConfig) {
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/\//g, '\\/').replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      
      if (regex.test(path)) {
        return cacheConfig[pattern];
      }
    }
  }
  
  // Default TTL for unspecified routes
  return 60; // 1 minute default
}

/**
 * Middleware to set cache control headers
 * @param {Object} options - Options for cache control
 * @returns {Function} - Express middleware
 */
exports.cacheControl = (options = {}) => {
  const {
    noCache = false,
    private = false,
    maxAge = null, // In seconds
    staleWhileRevalidate = 60, // In seconds
    staleIfError = 86400, // In seconds
    customHeaders = {} // Any additional cache headers
  } = options;
  
  return (req, res, next) => {
    // Skip cache headers for authenticated users if private flag is not set
    if (req.user && !private) {
      res.setHeader('Cache-Control', 'no-store, private');
      return next();
    }
    
    if (noCache) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      let cacheControl = private ? 'private' : 'public';
      
      // Determine max-age from options or route config
      let dynamicMaxAge = maxAge;
      if (dynamicMaxAge === null) {
        dynamicMaxAge = getCacheTTL(req.originalUrl || req.url);
      }
      
      if (dynamicMaxAge > 0) {
        cacheControl += `, max-age=${dynamicMaxAge}`;
        
        // Add stale-while-revalidate if a positive value is provided
        if (staleWhileRevalidate > 0) {
          cacheControl += `, stale-while-revalidate=${staleWhileRevalidate}`;
        }
        
        // Add stale-if-error if a positive value is provided
        if (staleIfError > 0) {
          cacheControl += `, stale-if-error=${staleIfError}`;
        }
      } else {
        cacheControl = 'no-store, no-cache, must-revalidate, proxy-revalidate';
      }
      
      res.setHeader('Cache-Control', cacheControl);
    }
    
    // Set any custom headers
    Object.entries(customHeaders).forEach(([header, value]) => {
      res.setHeader(header, value);
    });
    
    next();
  };
};

/**
 * Middleware to handle server-side caching
 * @param {Object} options - Options for server-side caching
 * @returns {Function} - Express middleware
 */
exports.serverCache = (options = {}) => {
  const {
    ttl = null, // TTL in seconds, null means use route config
    prefix = 'api', // Cache key prefix
    bypassQueryParam = 'nocache', // Query parameter to bypass cache
    methods = ['GET'], // HTTP methods to cache
    ignoreCache = false // Force ignore cache
  } = options;
  
  return async (req, res, next) => {
    // Only cache specific HTTP methods
    if (!methods.includes(req.method)) {
      return next();
    }
    
    // Skip caching for authenticated admin users for security
    if (req.user && req.user.role === 'admin') {
      return next();
    }
    
    // Skip caching if bypass parameter is present
    if (req.query[bypassQueryParam] !== undefined || ignoreCache) {
      return next();
    }
    
    // Determine TTL
    const cacheTTL = ttl !== null ? ttl : getCacheTTL(req.originalUrl || req.url);
    
    // Skip caching if TTL is 0
    if (cacheTTL <= 0) {
      return next();
    }
    
    // Generate cache key
    const cacheKey = generateCacheKey(req, prefix);
    
    try {
      // Try to get from cache
      const cachedResponse = await getCacheValue(cacheKey);
      
      if (cachedResponse) {
        // Set the appropriate headers
        res.set('X-Cache', 'HIT');
        
        // Check if ETag was provided
        if (cachedResponse.etag) {
          res.set('ETag', cachedResponse.etag);
          
          // Check if client sent If-None-Match header
          const ifNoneMatch = req.headers['if-none-match'];
          if (ifNoneMatch === cachedResponse.etag) {
            // Return 304 Not Modified without the body
            return res.status(304).end();
          }
        }
        
        // Check if Last-Modified was provided
        if (cachedResponse.lastModified) {
          res.set('Last-Modified', cachedResponse.lastModified);
          
          // Check if client sent If-Modified-Since header
          const ifModifiedSince = req.headers['if-modified-since'];
          if (ifModifiedSince && new Date(ifModifiedSince) >= new Date(cachedResponse.lastModified)) {
            // Return 304 Not Modified without the body
            return res.status(304).end();
          }
        }
        
        // Set the cached headers
        if (cachedResponse.headers) {
          Object.entries(cachedResponse.headers).forEach(([header, value]) => {
            res.set(header, value);
          });
        }
        
        // Return the cached response
        return res.status(cachedResponse.status || 200).json(cachedResponse.data);
      }
      
      // Cache miss, continue with the request
      res.set('X-Cache', 'MISS');
      
      // Capture the original json method
      const originalJson = res.json;
      
      // Override the json method to capture the response
      res.json = function(data) {
        // Restore the original json method
        res.json = originalJson;
        
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Generate ETag
          const etag = generateETag(data);
          if (etag) {
            res.set('ETag', etag);
          }
          
          // Set Last-Modified if not already set
          if (!res.get('Last-Modified')) {
            const now = new Date().toUTCString();
            res.set('Last-Modified', now);
          }
          
          // Cache the response
          const cacheData = {
            data,
            status: res.statusCode,
            etag,
            lastModified: res.get('Last-Modified'),
            headers: {
              'Content-Type': res.get('Content-Type')
            }
          };
          
          // Store in cache asynchronously (don't wait for completion)
          setCacheValue(cacheKey, cacheData, cacheTTL).catch(err => {
            console.error('Failed to cache response:', err);
          });
        }
        
        // Call the original json method
        return originalJson.call(this, data);
      };
      
      next();
    } catch (error) {
      console.error('Server cache middleware error:', error);
      next();
    }
  };
};

/**
 * Middleware to clear cache for specific routes
 * @param {String|Array} routes - Route path(s) to clear cache for
 * @returns {Function} - Express middleware
 */
exports.clearCache = (routes) => {
  const routePaths = Array.isArray(routes) ? routes : [routes];
  
  return async (req, res, next) => {
    try {
      // Clear cache for each route
      for (const route of routePaths) {
        await clearCacheByPrefix(route);
      }
      
      next();
    } catch (error) {
      console.error('Clear cache middleware error:', error);
      next();
    }
  };
};

/**
 * Clear cache for a specific resource type
 * @param {String} resourceType - Type of resource (e.g., 'routes', 'buses')
 * @returns {Promise<Boolean>} - Success indicator
 */
exports.clearResourceCache = async (resourceType) => {
  try {
    await clearCacheByPrefix(`api/${resourceType}`);
    return true;
  } catch (error) {
    console.error(`Failed to clear ${resourceType} cache:`, error);
    return false;
  }
};

/**
 * Invalidate cache when a resource is created, updated, or deleted
 * @param {String} resourceType - Type of resource (e.g., 'routes', 'buses')
 * @param {String} resourceId - ID of the resource
 * @returns {Promise<Boolean>} - Success indicator
 */
exports.invalidateResource = async (resourceType, resourceId) => {
  try {
    // Clear specific resource cache
    if (resourceId) {
      await clearCacheByPrefix(`api/${resourceType}/${resourceId}`);
    }
    
    // Clear list cache
    await clearCacheByPrefix(`api/${resourceType}`);
    
    // Clear related resources if needed
    if (resourceType === 'routes') {
      // Also clear bus cache as they're related
      await clearCacheByPrefix('api/buses');
    } else if (resourceType === 'buses') {
      // Also clear route cache as they're related
      await clearCacheByPrefix('api/routes');
    }
    
    return true;
  } catch (error) {
    console.error(`Failed to invalidate ${resourceType} cache:`, error);
    return false;
  }
};

// Export cache utility functions for use in other modules
exports.utils = {
  generateCacheKey,
  setCacheValue,
  getCacheValue,
  deleteCacheValue,
  clearCacheByPrefix,
  getCacheTTL
};

