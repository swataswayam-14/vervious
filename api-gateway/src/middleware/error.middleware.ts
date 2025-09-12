import { type Request, type Response, type NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { type ApiResponse } from '../types/message.types.js';

export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logger.error('API Gateway error:', error);

  const statusCode = error.statusCode || 500;
  const response: ApiResponse = {
    success: false,
    error: error.message || 'Internal server error',
  };

  res.status(statusCode).json(response);
};