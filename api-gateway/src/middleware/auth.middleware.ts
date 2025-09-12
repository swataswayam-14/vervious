import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { type ApiResponse } from '../types/message.types.js';
import { logger } from '../utils/logger.js';
import { User } from '../models/user.model.js'; // Your Mongoose user model
import dotenv from 'dotenv';

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
    console.log(decoded.userId);
    if (!decoded.userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid token',
      };
      res.status(401).json(response);
      return;
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found',
      };
      res.status(401).json(response);
      return;
    }

    req.user = {
      _id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt?.toISOString(),
      updatedAt: user.updatedAt?.toISOString(),
    };

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
