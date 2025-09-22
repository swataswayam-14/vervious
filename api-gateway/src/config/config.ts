import jwt from "jsonwebtoken";

export const config = {
  port: process.env.PORT || 3002,
  
  database: {
    url: process.env.DATABASE_URL || 'mongodb://localhost:27017',
    name: process.env.DATABASE_NAME || 'auth_service',
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  nats: {
    servers: process.env.NATS_SERVERS?.split(',') || ['nats://localhost:4222'],
  },
  
  jwt: {
    secret: (process.env.JWT_SECRET || 'super-secret-key-123') as jwt.Secret,
    accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
  },
  
  rateLimit: {
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '10'),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'), // 1 minute
  },
  
  session: {
    maxActiveSessions: parseInt(process.env.MAX_ACTIVE_SESSIONS || '5'),
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '86400000'), // 24 hours
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  serviceName: process.env.SERVICE_NAME || 'auth-service',
};