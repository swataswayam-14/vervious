// @ts-nocheck

import { User, type IUser} from '../models/user.model.js';
import { Session,type ISession } from '../models/session.model.js';
import { PasswordUtils } from '../utils/password.utils.js';
import { JWTUtils } from '../utils/jwt.utils.js';
import { RedisClient } from '../redis/client.js';
import { logger } from '../utils/logger.js';
import { CircuitBreaker } from '../helpers/helpers.js';
import { config } from '../config/config.js';
import { Types } from 'mongoose';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceInfo {
  userAgent?: string;
  ip?: string;
  deviceId?: string;
}

export class AuthService {
  private circuitBreaker: CircuitBreaker;

  constructor(private redisClient: RedisClient) {
    this.circuitBreaker = new CircuitBreaker(5, 30000, 60000);
  }

  async register(
    email: string, 
    password: string, 
    name: string,
    role: string,
    deviceInfo?: DeviceInfo
  ): Promise<{
    user: UserResponse;
    tokens: AuthTokens;
  }> {
    return this.circuitBreaker.execute(async () => {
      const lockKey = `register:${email}`;
      
      return this.redisClient.withLock(lockKey, async () => {
        const passwordValidation = PasswordUtils.validateStrength(password);
        if (!passwordValidation.isValid) {
          throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
          throw new Error('User already exists with this email');
        }

        const hashedPassword = await PasswordUtils.hash(password);

        const user = new User({
          email: email.toLowerCase(),
          password: hashedPassword,
          name: name.trim(),
          role: role,
        });

        await user.save();
        logger.info(`New user registered: ${email}`, { userId: user._id });

        const tokens = await this.generateTokensWithSession(user._id.toString(), user.email, deviceInfo);

        await this.cacheUserData(user._id.toString(), user);

        return {
          user: this.formatUserResponse(user),
          tokens,
        };
      });
    });
  }

  async login(
    email: string, 
    password: string,
    deviceInfo?: DeviceInfo
  ): Promise<{
    user: UserResponse;
    tokens: AuthTokens;
  }> {
    return this.circuitBreaker.execute(async () => {
      const lockKey = `login:${email}`;
      
      return this.redisClient.withLock(lockKey, async () => {
        const rateLimitKey = `login_attempts:${email}`;
        const isAllowed = await this.redisClient.rateLimit(rateLimitKey, 5, 300000); // 5 attempts per 5 minutes
        
        if (!isAllowed) {
          throw new Error('Too many login attempts. Please try again later.');
        }

        const user = await User.findOne({ 
          email: email.toLowerCase(),
          isActive: true 
        });
        
        if (!user) {
          throw new Error('Invalid email or password');
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          const lockTime = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
          throw new Error(`Account locked. Try again in ${lockTime} minutes.`);
        }

        if (!user.password) {
          throw new Error('Invalid email or password');
        }
        const isValidPassword = await PasswordUtils.compare(password, user.password);
        
        if (!isValidPassword) {
          user.failedLoginAttempts += 1;
          
          if (user.failedLoginAttempts >= 5) {
            user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
            logger.warn(`Account locked due to failed attempts: ${email}`, { userId: user._id });
          }
          
          await user.save();
          throw new Error('Invalid email or password');
        }

        user.failedLoginAttempts = 0;
        user.lockedUntil = undefined;
        user.lastLoginAt = new Date();
        await user.save();

        logger.info(`User logged in: ${email}`, { userId: user._id });

        await this.cleanupOldSessions(user._id.toString());

        const tokens = await this.generateTokensWithSession(user._id.toString(), user.email, deviceInfo);

        await this.cacheUserData(user._id.toString(), user);

        return {
          user: this.formatUserResponse(user),
          tokens,
        };
      });
    });
  }

async refreshTokens(refreshToken: string): Promise<AuthTokens> {
  return this.circuitBreaker.execute(async () => {
    const payload = JWTUtils.verifyToken(refreshToken);
    
    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    const session = await Session.findOne({
      sessionId: payload.sessionId,
      refreshToken,
      isRevoked: false,
    });

    if (!session) {
      throw new Error('Invalid or expired refresh token');
    }
    if (session.expiresAt < new Date()) {
      await Session.deleteOne({ _id: session._id });
      throw new Error('Refresh token expired');
    }

    let user = await this.getCachedUserData(payload.userId);
    if (!user) {
      const userDoc = await User.findById(payload.userId);
      if (!userDoc || !userDoc.isActive) {
        throw new Error('User not found or inactive');
      }
      user = userDoc;
      await this.cacheUserData(payload.userId, userDoc);
    }
    const newAccessToken = JWTUtils.generateAccessToken(
      payload.userId,
      user.email,
      payload.sessionId 
    );

    logger.info(`Access token refreshed for user: ${user.email}`, { 
      userId: user._id,
      sessionId: payload.sessionId
    });
    return {
      accessToken: newAccessToken,
      refreshToken: refreshToken,
    };
  });
}

  async logout(refreshToken: string): Promise<void> {
    try {
      const session = await Session.findOne({ refreshToken });
      
      if (session) {
        session.isRevoked = true;
        await session.save();
        
        await this.redisClient.del(`user:${session.userId}`);
        
        logger.info('User logged out successfully', { 
          userId: session.userId,
          sessionId: session.sessionId 
        });
      }
    } catch (error) {
      logger.error('Logout error:', error);
      throw error;
    }
  }

  async logoutAllDevices(userId: string): Promise<void> {
    try {
      await Session.updateMany(
        { userId, isRevoked: false },
        { isRevoked: true }
      );

      await this.redisClient.del(`user:${userId}`);

      logger.info('All devices logged out', { userId });
    } catch (error) {
      logger.error('Logout all devices error:', error);
      throw error;
    }
  }

  async getActiveSessions(userId: string): Promise<ISession[]> {
    try {
      return await Session.find({
        userId,
        isRevoked: false,
        expiresAt: { $gt: new Date() },
      }).sort({ createdAt: -1 });
    } catch (error) {
      logger.error('Get active sessions error:', error);
      throw error;
    }
  }

  private async generateTokensWithSession(//
    userId: string, 
    email: string, 
    deviceInfo?: DeviceInfo
  ): Promise<AuthTokens> {
    const sessionId = JWTUtils.generateSessionId();
    const accessToken = JWTUtils.generateAccessToken(userId, email, sessionId);
    const refreshToken = JWTUtils.generateRefreshToken(userId, email, sessionId);

    const session = new Session({
      userId,
      sessionId,
      refreshToken,
      deviceInfo,
      expiresAt: JWTUtils.getTokenExpiry(refreshToken),
    });
    
    await session.save();

    return {
      accessToken,
      refreshToken,
    };
  }

  private async cleanupOldSessions(userId: string): Promise<void> {
    try {
      const activeSessions = await Session.find({
        userId,
        isRevoked: false,
        expiresAt: { $gt: new Date() },
      }).sort({ createdAt: -1 });
      if (activeSessions.length >= config.session.maxActiveSessions) {
        const sessionsToRevoke = activeSessions.slice(config.session.maxActiveSessions - 1);
        
        await Session.updateMany(
            //@ts-ignore
          { _id: { $in: sessionsToRevoke.map(s => s._id) } },
          { isRevoked: true }
        );

        logger.info(`Cleaned up ${sessionsToRevoke.length} old sessions for user ${userId}`);
      }
    } catch (error) {
      logger.error('Session cleanup error:', error);
    }
  }

  private async cacheUserData(userId: string, user: IUser): Promise<void> {
    try {
      await this.redisClient.set(`user:${userId}`, this.formatUserResponse(user), 3600); // Cache for 1 hour
    } catch (error) {
      logger.error('Cache user data error:', error);
    }
  }

  private async getCachedUserData(userId: string): Promise<IUser | null> {
    try {
      return await this.redisClient.get<IUser>(`user:${userId}`);
    } catch (error) {
      logger.error('Get cached user data error:', error);
      return null;
    }
  }

  private formatUserResponse(user: IUser): UserResponse {
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async cleanupExpiredTokens(): Promise<void> {
    try {
      const result = await Session.deleteMany({
        $or: [
          { expiresAt: { $lt: new Date() } },
          { isRevoked: true, updatedAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
        ]
      });
      
      if (result.deletedCount > 0) {
        logger.info(`Cleaned up ${result.deletedCount} expired/revoked sessions`);
      }
    } catch (error) {
      logger.error('Token cleanup error:', error);
    }
  }
}