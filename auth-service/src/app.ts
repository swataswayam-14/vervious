import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/config.js';
import { logger } from './utils/logger.js';
import { DatabaseConnection } from './utils/database.js';
import { RedisClient } from './redis/client.js';
import { AuthService } from './services/auth.service.js';
import { setupNatsHandlers } from './handlers/nats.handlers.js';
import { errorHandler } from './middleware/error.middleware.js';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware.js';
import { connectNats } from './nats/client.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

const database = new DatabaseConnection();
const redisClient = new RedisClient(config.redis.url);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(rateLimitMiddleware(redisClient));

app.get('/health', async (req, res) => {
  const health = {
    status: 'OK',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
    database: database.isActive(),
    redis: redisClient.getClient().status === 'ready',
  };
  
  res.status(200).json(health);
});

app.get('/metrics', async (req, res) => {
  // Prometheus here
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});

app.use(errorHandler);

const startServer = async () => {
  try {
    await database.connect(config.database.url, config.database.name);
    logger.info('Database connected successfully');

    await redisClient.connect();
    logger.info('Redis connected successfully');
    
    await connectNats(
      process.env.NATS_URL?.split(',') || ['nats://localhost:4222']
    );
    logger.info('Connected to NATS');

    const authService = new AuthService(redisClient);
    
    await setupNatsHandlers(authService);
    logger.info('NATS handlers setup successfully');

    const port = config.port || 3002;
    app.listen(port, () => {
      logger.info(`Auth service listening on port ${port}`);
    });
  } catch (error) {
    logger.error('Failed to start auth service:', error);
    process.exit(1);
  }
};

const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');
  
  try {
    await database.disconnect();
    await redisClient.disconnect();
    logger.info('Cleanup completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();