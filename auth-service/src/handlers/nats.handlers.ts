import { getNatsClient } from '../nats/client.js';
import {
  NATS_SUBJECTS,
  type AuthLoginRequest,
  type AuthRegisterRequest,
  type AuthValidateRequest,
  type AuthValidateResponse,
} from '../types/message.types.js';

import { AuthService } from '../services/auth.service.js';
import { logger } from '../utils/logger.js';
import jwt from 'jsonwebtoken'

interface AuthRefreshRequest {
  refreshToken: string;
  messageId: string;
}

interface AuthLogoutRequest {
  refreshToken: string;
  messageId: string;
}

interface LogoutAllRequest {
  userId: string;
  messageId: string;
}

interface ActiveSessionsRequest {
  userId: string;
  messageId: string;
}

export const setupNatsHandlers = async (authService: AuthService) => {
  const natsClient = getNatsClient();

  natsClient.subscribe<AuthRegisterRequest>(
    NATS_SUBJECTS.AUTH_REGISTER,
    async (requestData, subject, replyTo) => {
      try {
        logger.info(`Processing register request for: ${requestData.email}`, {
          messageId: requestData.messageId,
        });

        if (!requestData.email || !requestData.password || !requestData.name) {
          throw new Error('Missing required fields: email, password, or name');
        }

        const deviceInfo = {
          userAgent: requestData.userAgent || 'unknown',
          ip: requestData.ip || 'unknown',
          deviceId: requestData.deviceId || 'unknown',
        };

        const result = await authService.register(
          requestData.email,
          requestData.password,
          requestData.name,
          requestData.role,
          deviceInfo
        );

        logger.info(`User registered successfully: ${result.user.id}`, {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          natsClient.publish(replyTo, {
            success: true,
            user: result.user,
            tokens: result.tokens,
            message: "User registered successfully"
          });
          console.log('Response sent to:', replyTo);
        } else {
          console.log('No reply subject available');
        }

      } catch (error) {
        logger.error('Register handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          natsClient.publish(replyTo, {
            success: false,
            error: error instanceof Error ? error.message : 'Registration failed'
          });
          console.log('Error response sent to:', replyTo);
        }
      }
    }
  );

 natsClient.subscribe<AuthLoginRequest>(
  NATS_SUBJECTS.AUTH_LOGIN,
  async (requestData, subject, replyTo) => {
    try {
      logger.info(`Processing login request for: ${requestData.email}`, {
        messageId: requestData.messageId,
      });

      if (!requestData.email || !requestData.password) {
        throw new Error('Missing required fields: email or password');
      }

      const deviceInfo = {
        userAgent: requestData.userAgent || 'unknown',
        ip: requestData.ip || 'unknown',
        deviceId: requestData.deviceId || 'unknown',
      };

      const result = await authService.login(
        requestData.email,
        requestData.password,
        deviceInfo
      );

      logger.info(`User logged in successfully: ${result.user.id}`, {
        messageId: requestData.messageId,
      });
      if (replyTo) {
        natsClient.publish(replyTo, {
          success: true,
          user: result.user,
          tokens: result.tokens,
          message: "User logged in successfully"
        });
        console.log('Login response sent to:', replyTo);
      } else {
        console.log('No reply subject available for login');
      }

    } catch (error) {
      logger.error('Login handler error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId: requestData?.messageId,
      });

      if (replyTo) {
        natsClient.publish(replyTo, {
          success: false,
          error: error instanceof Error ? error.message : 'Login failed'
        });
        console.log('Login error response sent to:', replyTo);
      }
    }
  }
);

natsClient.subscribe<AuthRefreshRequest>(
  NATS_SUBJECTS.AUTH_REFRESH,
  async (requestData, subject, replyTo) => {
    try {
      logger.info('Processing token refresh request', {
        messageId: requestData.messageId,
      });

      if (!requestData.refreshToken) {
        throw new Error('Refresh token is required');
      }

      const tokens = await authService.refreshTokens(requestData.refreshToken);

      logger.info('Tokens refreshed successfully', {
        messageId: requestData.messageId,
      });

      if (replyTo) {
        natsClient.publish(replyTo, {
          success: true,
          tokens: tokens, 
          message: "Token refreshed successfully"
        });
        console.log('Token refresh response sent to:', replyTo);
      } else {
        console.log('No reply subject available for token refresh');
      }

    } catch (error) {
      logger.error('Token refresh handler error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId: requestData?.messageId,
      });

      if (replyTo) {
        natsClient.publish(replyTo, {
          success: false,
          error: error instanceof Error ? error.message : 'Token refresh failed'
        });
        console.log('Token refresh error response sent to:', replyTo);
      }
    }
  }
);

natsClient.subscribe<AuthLogoutRequest>(
  NATS_SUBJECTS.AUTH_LOGOUT,
  async (requestData, subject, replyTo) => {
    try {
      logger.info('Processing logout request', {
        messageId: requestData.messageId,
      });

      if (!requestData.refreshToken) {
        throw new Error('Refresh token is required for logout');
      }

      await authService.logout(requestData.refreshToken);

      logger.info('User logged out successfully', {
        messageId: requestData.messageId,
      });

      if (replyTo) {
        natsClient.publish(replyTo, {
          success: true,
          message: "Logout successful"
        });
      }

    } catch (error) {
      logger.error('Logout handler error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId: requestData?.messageId,
      });

      if (replyTo) {
        natsClient.publish(replyTo, {
          success: false,
          error: error instanceof Error ? error.message : 'Logout failed'
        });
      }
    }
  }
);
  natsClient.subscribe<LogoutAllRequest>(
    'auth.logout.all',
    async (request) => {
      try {
        await authService.logoutAllDevices(request.userId);

        logger.info('User logged out from all devices', {
          messageId: request.messageId,
        });
      } catch (error) {
        logger.error('Logout all devices handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: request.messageId,
        });
      }
    }
  );

  natsClient.subscribe<ActiveSessionsRequest>(
    'auth.sessions.active',
    async (request) => {
      try {
        const sessions = await authService.getActiveSessions(request.userId);

        logger.info(`Fetched ${sessions.length} active sessions`, {
          messageId: request.messageId,
        });
      } catch (error) {
        logger.error('Get active sessions handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: request.messageId,
        });
      }
    }
  );
  natsClient.subscribe<AuthValidateRequest>(
  NATS_SUBJECTS.AUTH_VALIDATE,
  async (requestData, subject, replyTo) => {
    try {
      if (!requestData.token) {
        throw new Error('Token is required');
      }
      const decoded = jwt.verify(requestData.token, "super-secret-key-123") as any;
//@ts-ignore
      const response: AuthValidateResponse = {
        success: true,
        user: {
          _id: decoded._id,
          email: decoded.email,
          name: decoded.name,
          role: decoded.role,
        },
      };

      if (replyTo) {
        natsClient.publish(replyTo, response);
      }
    } catch (error) {
      //@ts-ignore
      const response: AuthValidateResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Token validation failed',
      };
      if (replyTo) {
        natsClient.publish(replyTo, response);
      }
    }
  }
);

  setInterval(async () => {
    try {
      await authService.cleanupExpiredTokens();
      logger.info('Expired tokens cleaned up');
    } catch (error) {
      logger.error('Error cleaning up expired tokens:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, 60 * 60 * 1000);

  logger.info('NATS handlers registered successfully');
};


