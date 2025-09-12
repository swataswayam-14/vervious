import { type Request, type Response, type NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Unhandled error:', { 
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token', 
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expired',
    });
  }
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: error.message,
    });
  }
  if (error.name === 'MongoServerError' && (error as any).code === 11000) {
    return res.status(400).json({
      success: false,
      error: 'Resource already exists',
    });
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    ...(config.nodeEnv === 'development' && { 
      details: error.message,
      stack: error.stack 
    }),
  });
};
