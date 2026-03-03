import logger from '../utils/logger.js';

/**
 * Centralized error handler.
 * Formats errors consistently and prevents stack trace leakage in production.
 */

// Custom application error class with HTTP status codes
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Not authorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMITED');
  }
}

/**
 * Express error handling middleware.
 * Must be the LAST middleware in the chain (4-argument signature).
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  // Default to 500 if no statusCode
  const statusCode = err.statusCode || 500;
  const isServerError = statusCode >= 500;

  // Log server errors with full stack; client errors at warn level
  if (isServerError) {
    logger.error('Server error', {
      error: err.message,
      stack: err.stack,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userId: req.user?._id?.toString(),
    });
  } else {
    logger.warn('Client error', {
      error: err.message,
      code: err.code,
      statusCode,
      method: req.method,
      url: req.originalUrl,
    });
  }

  const response = {
    success: false,
    error: {
      message: isServerError && process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
      code: err.code || 'INTERNAL_ERROR',
    },
  };

  // Include validation details for 400 errors
  if (err.details) {
    response.error.details = err.details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}
