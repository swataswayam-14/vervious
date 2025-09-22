//@ts-nocheck
import { type Request, type Response, type NextFunction } from 'express';
import { JWTUtils, type JWTPayload } from '../utils/jwt.utils.js';
import { Session } from '../models/session.model.js';
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

export const isAuthenticated = (req: AuthenticatedRequest): req is AuthenticatedRequest & { user: NonNullable<AuthenticatedRequest['user']> } => {
  return req.user !== undefined && req.user !== null;
};

const redisClient = new RedisClient(process.env.REDIS_URL || 'redis://localhost:6379');

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

      if (!dbUser.role) {
        logger.error('User found but missing role field', {
          userId: payload.userId,
          userEmail: dbUser.email,
          userName: dbUser.name
        });
        return respondWithError(res, 500, 'User configuration error');
      }

      user = {
        _id: dbUser._id?.toString() || dbUser.id?.toString(),
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
      
      if (!user._id && (user as any).id) {
        user._id = (user as any).id;
      }
      
      if (!user.role) {
        logger.warn('Cached user missing role, invalidating cache and refetching', {
          userId: payload.userId,
          userEmail: user.email
        });
        try {
          await redisClient.del(`user:${payload.userId}`);
        } catch (deleteError) {
          logger.warn('Failed to delete cache, will overwrite', { 
            error: deleteError instanceof Error ? deleteError.message : 'Unknown error',
            userId: payload.userId 
          });
          await redisClient.set(`user:${payload.userId}`, null, 1);
        }
        
        const dbUser = await User.findById(payload.userId);
        if (!dbUser || !dbUser.isActive || !dbUser.role) {
          logger.error('User refetch failed or missing role', {
            userId: payload.userId,
            found: !!dbUser,
            isActive: dbUser?.isActive,
            hasRole: !!dbUser?.role
          });
          return respondWithError(res, 401, 'User configuration error');
        }
        
        user = {
          _id: dbUser._id?.toString() || dbUser.id?.toString(),
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role,
          isActive: dbUser.isActive,
          createdAt: dbUser.createdAt?.toISOString(),
          updatedAt: dbUser.updatedAt?.toISOString(),
        };
        
        await redisClient.set(`user:${payload.userId}`, user, 3600);
      }
    }

    if (!user || !user._id || !user.email || !user.role) {
      logger.error('Invalid user object from cache/database', {
        userId: payload.userId,
        user: user,
        hasId: !!(user as any)?.id,
        has_Id: !!user?._id,
        hasEmail: !!user?.email,
        hasRole: !!user?.role
      });
      return respondWithError(res, 401, 'Invalid user data');
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
    logger.error('Admin middleware called without authentication', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return respondWithError(res, 401, 'Authentication required');
  }

  if (!req.user._id || !req.user.role) {
    logger.error('Incomplete user object in admin middleware', {
      userId: req.user._id,
      hasRole: !!req.user.role,
      user: req.user,
      ip: req.ip
    });
    return respondWithError(res, 401, 'Invalid authentication data');
  }

  if (req.user.isActive === false) {
    logger.warn('Inactive user attempted admin access', {
      userId: req.user._id,
      email: req.user.email,
      ip: req.ip
    });
    return respondWithError(res, 403, 'Account is inactive');
  }

  if (req.user.role !== 'admin') {
    logger.warn('Non-admin user attempted admin access', {
      userId: req.user._id,
      role: req.user.role,
      email: req.user.email,
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    return respondWithError(res, 403, 'Admin access required');
  }
  
  logger.info('Admin access granted', {
    userId: req.user._id,
    email: req.user.email,
    path: req.path,
    method: req.method,
    ip: req.ip
  });
  
  next();
};

export const requireRole = (allowedRoles: string[]) => {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new Error('requireRole middleware requires a non-empty array of roles');
  }

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      logger.error('Role middleware called without authentication', {
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      return respondWithError(res, 401, 'Authentication required');
    }

    if (!req.user._id || !req.user.role) {
      logger.error('Incomplete user object in role middleware', {
        userId: req.user._id,
        hasRole: !!req.user.role,
        requiredRoles: allowedRoles,
        ip: req.ip
      });
      return respondWithError(res, 401, 'Invalid authentication data');
    }

    if (req.user.isActive === false) {
      logger.warn('Inactive user attempted role-based access', {
        userId: req.user._id,
        email: req.user.email,
        requiredRoles: allowedRoles,
        ip: req.ip
      });
      return respondWithError(res, 403, 'Account is inactive');
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Insufficient role for access', {
        userId: req.user._id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        email: req.user.email,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      return respondWithError(res, 403, `Access denied. Required roles: ${allowedRoles.join(', ')}`);
    }

    logger.info('Role-based access granted', {
      userId: req.user._id,
      userRole: req.user.role,
      requiredRoles: allowedRoles,
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    
    next();
  };
};
export const ensureAuthenticated = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!isAuthenticated(req)) {
    logger.error('Unauthenticated request to protected route', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return respondWithError(res, 401, 'Authentication required');
  }
  next();
};