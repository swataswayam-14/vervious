//@ts-nocheck
import { type Request, type Response, type NextFunction } from 'express';
import { JWTUtils, type JWTPayload } from '../utils/jwt.utils.js';
import { Session } from 'inspector/promises';
import { type ApiResponse } from '../types/message.types.js';
import { logger } from '../utils/logger.js';
import { User } from '../models/user.model.js';
import { RedisClient } from '../redis/client.js';

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
  sessionId?: string; 
}

const redisClient = new RedisClient(process.env.REDIS_URL || 'redis://redis:6379');

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return respondWithError(res, 401, 'No token provided');
    }
    let payload: JWTPayload;
    try {
      payload = JWTUtils.verifyToken(token);
    } catch (error) {
      logger.warn('Invalid JWT token attempt', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      return respondWithError(res, 401, 'Invalid or expired token');
    }
    if (payload.type !== 'access') {
      logger.warn('Wrong token type used for authentication', { 
        tokenType: payload.type,
        userId: payload.userId,
        ip: req.ip
      });
      return respondWithError(res, 401, 'Invalid token type');
    }
    const session = await Session.findOne({
      sessionId: payload.sessionId,
      userId: payload.userId,
      isRevoked: false, 
    });

    if (!session) {
      logger.warn('Session not found or revoked', {
        sessionId: payload.sessionId,
        userId: payload.userId,
        ip: req.ip
      });
      return respondWithError(res, 401, 'Session invalid or expired');
    }

    if (session.expiresAt < new Date()) {
      logger.info('Expired session accessed', {
        sessionId: payload.sessionId,
        userId: payload.userId,
        expiresAt: session.expiresAt
      });
      
      await Session.deleteOne({ _id: session._id });
      return respondWithError(res, 401, 'Session expired');
    }

    let user = await redisClient.get<AuthenticatedRequest['user']>(`user:${payload.userId}`);

    if (!user) {
      logger.info(`Cache miss for user:${payload.userId}, querying DB`);
      const dbUser = await User.findById(payload.userId);

      if (!dbUser || !dbUser.isActive) {
        logger.warn('Inactive or deleted user attempted access', {
          userId: payload.userId,
          found: !!dbUser,
          isActive: dbUser?.isActive
        });
        return respondWithError(res, 401, 'User not found or inactive');
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

      await redisClient.set(`user:${payload.userId}`, user, 3600);
    } else {
      logger.debug(`Cache hit for user:${payload.userId}`);
    }
    await updateSessionActivity(session._id.toString(), req);

    req.user = user;
    req.sessionId = payload.sessionId;
    next();

  } catch (error) {
    logger.error('Auth middleware error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    return respondWithError(res, 401, 'Authentication failed');
  }
};

function respondWithError(res: Response, status: number, message: string): void {
  const response: ApiResponse = {
    success: false,
    error: message,
  };
  res.status(status).json(response);
}

async function updateSessionActivity(sessionId: string, req: AuthenticatedRequest): Promise<void> {
  try {
    await Session.updateOne(
      { _id: sessionId },
      { 
        $set: { 
          lastActivityAt: new Date(),
          lastActivityIp: req.ip,
          lastActivityUserAgent: req.get('User-Agent')
        }
      }
    );
  } catch (error) {
    logger.warn('Failed to update session activity', { error, sessionId });
  }
}

export const adminMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return respondWithError(res, 401, 'Authentication required');
  }
  
  if (req.user.role !== 'admin') {
    logger.warn('Non-admin user attempted admin access', {
      userId: req.user._id,
      role: req.user.role,
      ip: req.ip
    });
    return respondWithError(res, 403, 'Admin access required');
  }
  
  next();
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return respondWithError(res, 401, 'Authentication required');
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Insufficient role for access', {
        userId: req.user._id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        ip: req.ip
      });
      return respondWithError(res, 403, `Access denied. Required roles: ${allowedRoles.join(', ')}`);
    }
    
    next();
  };
};