const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for GPS verification endpoint
 * Prevents brute-force attempts to guess gift locations
 * 10 requests per minute per IP
 */
const verifyLocationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: {
    error: 'Too many requests',
    message: 'Please wait before trying again',
    retryAfter: '60 seconds',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use X-Forwarded-For for proxy/load balancer setups
    return req.headers['x-forwarded-for'] || req.ip;
  },
});

/**
 * General API rate limiter
 * 100 requests per minute per IP
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for gift creation
 * 5 requests per minute per IP
 */
const createGiftLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  message: {
    error: 'Too many gift creation requests',
    message: 'Please wait before creating another gift',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  verifyLocationLimiter,
  apiLimiter,
  createGiftLimiter,
};
