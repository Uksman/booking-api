const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

// Determine environment
const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';
const isProduction = !isDevelopment && !isTest;

// Create log directory if it doesn't exist
const logDirectory = path.join(__dirname, '../logs');
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory);
}

// Create log streams
const accessLogStream = fs.createWriteStream(
  path.join(logDirectory, 'access.log'),
  { flags: 'a' }
);

const errorLogStream = fs.createWriteStream(
  path.join(logDirectory, 'error.log'),
  { flags: 'a' }
);

/**
 * Custom morgan token for response time in a more human-readable format
 */
morgan.token('response-time-formatted', (req, res) => {
  const time = res.responseTime || 0;
  // Format based on time magnitude
  if (time < 1) {
    return `${(time * 1000).toFixed(2)}μs`;
  } else if (time < 1000) {
    return `${time.toFixed(2)}ms`;
  } else {
    return `${(time / 1000).toFixed(2)}s`;
  }
});

/**
 * Custom morgan token for user ID
 */
morgan.token('user-id', (req) => {
  return req.user ? req.user._id : 'anonymous';
});

/**
 * Custom morgan token for user role
 */
morgan.token('user-role', (req) => {
  return req.user ? req.user.role : 'anonymous';
});

/**
 * Custom morgan token for request body (sanitized for security)
 */
morgan.token('request-body', (req) => {
  if (!req.body) return '';
  
  // Create a sanitized copy of the request body
  const sanitized = { ...req.body };
  
  // Remove sensitive fields
  const sensitiveFields = ['password', 'token', 'creditCard', 'cardNumber', 'cvv', 'secret'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) sanitized[field] = '[REDACTED]';
  });
  
  return JSON.stringify(sanitized);
});

/**
 * Custom morgan token for response body
 */
morgan.token('response-body', (req, res) => {
  if (!res.body) return '';
  return JSON.stringify(res.body);
});

/**
 * Custom morgan token for date with ISO format
 */
morgan.token('date-iso', () => {
  return new Date().toISOString();
});

/**
 * Development format: colored and verbose for console
 */
const developmentFormat = morgan.compile(
  ':method :url :status :response-time-formatted - :res[content-length] - :user-id :user-role'
);

/**
 * Production format: detailed and machine-readable for logs
 */
const productionFormat = morgan.compile(
  ':date-iso :method :url :status :response-time-formatted :remote-addr :user-id :user-role :http-version :referrer :user-agent'
);

/**
 * HTTP request logger middleware for development environment (console output)
 */
exports.developmentLogger = morgan(function (tokens, req, res) {
  // Color status code based on status
  const status = tokens.status(req, res);
  let statusColor = '\x1b[32m'; // Green for 2xx
  if (status >= 400) statusColor = '\x1b[31m'; // Red for 4xx, 5xx
  else if (status >= 300) statusColor = '\x1b[33m'; // Yellow for 3xx
  
  // Get response time and color it based on duration
  const responseTime = tokens['response-time'](req, res);
  let responseTimeColor = '\x1b[32m'; // Green for fast response
  if (responseTime > 1000) responseTimeColor = '\x1b[31m'; // Red for slow response
  else if (responseTime > 500) responseTimeColor = '\x1b[33m'; // Yellow for medium response
  
  // Format the log line with colors
  return [
    '\x1b[36m' + tokens.method(req, res) + '\x1b[0m', // Cyan method
    tokens.url(req, res),
    statusColor + status + '\x1b[0m',
    responseTimeColor + tokens['response-time-formatted'](req, res) + '\x1b[0m',
    '-',
    tokens.res(req, res, 'content-length') || '0',
    '-',
    tokens['user-id'](req, res),
    tokens['user-role'](req, res)
  ].join(' ');
});

/**
 * HTTP request logger middleware for production environment (file output)
 */
exports.productionLogger = morgan(productionFormat, {
  stream: accessLogStream
});

/**
 * Error logger middleware
 * Logs detailed error information
 */
exports.errorLogger = (err, req, res, next) => {
  const timestamp = new Date().toISOString();
  const userId = req.user ? req.user._id : 'anonymous';
  const userRole = req.user ? req.user.role : 'anonymous';
  
  // Create error log entry
  const errorLog = {
    timestamp,
    level: 'error',
    message: err.message,
    stack: err.stack,
    status: err.status || 500,
    request: {
      method: req.method,
      url: req.originalUrl || req.url,
      headers: req.headers,
      body: req.body,
      ip: req.ip,
      userId,
      userRole
    }
  };
  
  // Log to console in development
  if (isDevelopment) {
    console.error('\x1b[31m%s\x1b[0m', '-------- ERROR LOG --------');
    console.error('\x1b[31m%s\x1b[0m', err.message);
    console.error(err.stack);
    console.error('\x1b[31m%s\x1b[0m', '--------------------------');
  }
  
  // Log to error file in production
  if (isProduction) {
    errorLogStream.write(JSON.stringify(errorLog) + '\n');
  }

  // Pass the error to the next error handler
  next(err);
};

/**
 * Performance monitoring middleware
 * Tracks and logs request timing and resource usage
 */
exports.performanceMonitor = (req, res, next) => {
  // Record start time
  const start = process.hrtime();
  
  // Record initial memory usage
  const initialMemoryUsage = process.memoryUsage();
  
  // Store initial CPU usage
  const initialCpuUsage = process.cpuUsage();
  
  // Add a listener for when the response is finished
  res.on('finish', () => {
    // Calculate timing
    const hrtime = process.hrtime(start);
    const responseTimeMs = (hrtime[0] * 1000 + hrtime[1] / 1000000).toFixed(2);
    
    // Store in response object for use in logs
    res.responseTime = responseTimeMs / 1000; // Convert to seconds for morgan
    
    // Calculate memory and CPU usage deltas
    const finalMemoryUsage = process.memoryUsage();
    const finalCpuUsage = process.cpuUsage(initialCpuUsage);
    
    const memoryDelta = {
      rss: (finalMemoryUsage.rss - initialMemoryUsage.rss) / 1024 / 1024, // MB
      heapTotal: (finalMemoryUsage.heapTotal - initialMemoryUsage.heapTotal) / 1024 / 1024, // MB
      heapUsed: (finalMemoryUsage.heapUsed - initialMemoryUsage.heapUsed) / 1024 / 1024 // MB
    };
    
    // Check if request is slow (>500ms)
    const isSlowRequest = responseTimeMs > 500;
    
    // Only log performance for slow requests or in development
    if (isSlowRequest || isDevelopment) {
      const perfData = {
        timestamp: new Date().toISOString(),
        requestId: req.id,
        method: req.method,
        url: req.originalUrl || req.url,
        responseTime: `${responseTimeMs}ms`,
        slow: isSlowRequest,
        userId: req.user ? req.user._id : 'anonymous',
        memoryUsage: memoryDelta,
        cpuUsage: {
          user: finalCpuUsage.user / 1000, // microseconds to milliseconds
          system: finalCpuUsage.system / 1000 // microseconds to milliseconds
        }
      };
      
      // Log to console in development
      if (isDevelopment && isSlowRequest) {
        console.warn('\x1b[33m%s\x1b[0m', '-------- SLOW REQUEST --------');
        console.warn(`${perfData.method} ${perfData.url} - ${perfData.responseTime}`);
        console.warn(`Memory: ${perfData.memoryUsage.heapUsed.toFixed(2)}MB`);
        console.warn('\x1b[33m%s\x1b[0m', '-----------------------------');
      }
      
      // Log to performance log file in production
      if (isProduction && isSlowRequest) {
        const performanceLogStream = fs.createWriteStream(
          path.join(logDirectory, 'performance.log'),
          { flags: 'a' }
        );
        performanceLogStream.write(JSON.stringify(perfData) + '\n');
      }
    }
  });
  
  next();
};

/**
 * Main logger middleware
 * Combines HTTP logging, error logging, and performance monitoring
 */
exports.logger = (req, res, next) => {
  // Add request ID for tracking
  req.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  
  // Use appropriate logger based on environment
  if (isDevelopment) {
    this.developmentLogger(req, res, (err) => {
      if (err) return next(err);
      this.performanceMonitor(req, res, next);
    });
  } else if (isProduction) {
    this.productionLogger(req, res, (err) => {
      if (err) return next(err);
      this.performanceMonitor(req, res, next);
    });
  } else {
    // Skip logging in test environment
    this.performanceMonitor(req, res, next);
  }
};

/**
 * Capture response body for logging
 * Use this middleware before routes if you want to log response bodies
 */
exports.captureResponseBody = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(body) {
    res.body = body;
    return originalSend.call(this, body);
  };
  
  next();
};

