// Rate limiting and input validation middleware
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

function validateInput(req, res, next) {
  // Sanitize request body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      const value = req.body[key];
      if (typeof value === 'string') {
        // Remove potential XSS vectors
        req.body[key] = value
          .replace(/<script[^>]*>.*?<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .trim();
      }
    });
  }

  // Validate request headers
  const contentLength = parseInt(req.headers['content-length'], 10);
  if (contentLength > 10 * 1024 * 1024) { // 10MB limit
    return res.status(413).json({ error: 'Payload too large' });
  }

  next();
}

module.exports = {
  limiter,
  validateInput,
};
