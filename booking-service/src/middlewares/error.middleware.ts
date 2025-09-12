import { type Request, type Response, type NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface CustomError extends Error {
  statusCode?: number;
  code?: string | number;
  keyPattern?: any;
  keyValue?: any;
  errors?: any;
  path?: string;
  value?: any;
}

export const errorHandler = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal Server Error';

  logger.error('Error Handler:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  if (error.name === 'ValidationError') {
    statusCode = 400;
    const errors = Object.values(error.errors || {}).map((val: any) => val.message);
    message = `Validation Error: ${errors.join(', ')}`;
  }

  if (error.code === 11000) {
    statusCode = 400;
    const field = Object.keys(error.keyValue || {})[0];
    message = `Duplicate value for field: ${field}`;
  }

  if (error.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${error.path}: ${error.value}`;
  }

  if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  if (error.message?.toLowerCase().includes('timeout')) {
    statusCode = 503;
    message = 'Service temporarily unavailable';
  }

  if (error.message.includes('Event not found')) {
    statusCode = 404;
  }

  if (
    error.message.includes('tickets available') ||
    error.message.includes('capacity')
  ) {
    statusCode = 409; 
  }

  if (error.message.includes('Unauthorized')) {
    statusCode = 403;
  }

  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal Server Error';
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
      raw: error,
    }),
  });
};
