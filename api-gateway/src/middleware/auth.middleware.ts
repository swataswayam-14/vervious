import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { type ApiResponse } from '../types/message.types.js';
import { logger } from '../utils/logger.js';
import { User } from '../models/user.model.js'; // Your Mongoose user model
import dotenv from 'dotenv';
import { RedisClient } from '../redis/client.js';

dotenv.config();

export interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    email: string;
    name: string;
    role: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
  };
}

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-123';
const redisClient = new RedisClient((process.env.REDIS_URL || 'redis://redis:6379'));

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      const response: ApiResponse = {
        success: false,
        error: 'No token provided',
      };
      res.status(401).json(response);
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    if (!decoded.userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid token',
      };
      res.status(401).json(response);
      return;
    }
    let user = await redisClient.get<AuthenticatedRequest['user']>(`user:${decoded.userId}`);

    if(!user) {
      logger.info(`Cache miss for user:${decoded.userId}, querying DB`);
      const dbUser = await User.findById(decoded.userId);

      if (!dbUser) {
        const response: ApiResponse = {
          success: false,
          error: 'User not found',
        };
        res.status(401).json(response);
        return;
      }

      user = {
        _id: dbUser._id.toString(),
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        isActive: dbUser.isActive,
        createdAt: dbUser.createdAt?.toISOString(),
        updatedAt: dbUser.updatedAt?.toISOString(),
      };
      await redisClient.set(`user:${decoded.userId}`, user, 3600); // re-cache for 1 hour
    } else {
      logger.info(`Cache hit for user:${decoded.userId}`);
    }
    req.user = user;
    next();

  } catch (error) {
    logger.error('Auth middleware error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Authentication failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
    };
    res.status(401).json(response);
  }
};

export const adminMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || req.user.role !== 'admin') {
    const response: ApiResponse = {
      success: false,
      error: 'Admin access required',
    };
    res.status(403).json(response);
    return;
  }
  next();
};
