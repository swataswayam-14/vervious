import { type Request,type Response,type NextFunction } from 'express';
import { RedisClient } from '../redis/client.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

export const rateLimitMiddleware = (redisClient: RedisClient) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientId = req.ip || 'unknown';
      const key = `rate_limit:${clientId}`;
      
      const allowed = await redisClient.rateLimit(
        key,
        config.rateLimit.maxRequests,
        config.rateLimit.windowMs
      );
      
      if (!allowed) {
        logger.warn(`Rate limit exceeded for IP: ${clientId}`);
        return res.status(429).json({
          success: false,
          error: 'Too many requests. Please try again later.',
        });
      }
      
      next(); 
    } catch (error) {
      logger.error('Rate limit middleware error:', error);
      next();
    }
  };
};