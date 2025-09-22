import { connectNats } from './nats/client.js';
import mongoose from 'mongoose';
import { RedisClient } from './redis/client.js';
import { logger } from './utils/logger.js';
import { EventService } from './services/event.service.js';
import { setupNatsHandlers } from './handlers/nats.handler.js';
import { gracefulShutdown } from './nats/client.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', async (req, res) => {
  const health = {
    status: 'OK',
    service: 'event-service',
    timestamp: new Date().toISOString(),
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

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'auth_service';

async function main() {
  try {
    await mongoose.connect(MONGO_URI, {
      dbName: DB_NAME,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info('Connected to MongoDB via Mongoose');

    const redis = new RedisClient(process.env.REDIS_URL);
    await redis.connect();
    logger.info('Connected to Redis');
    await connectNats(process.env.NATS_URL?.split(',') || ['nats://localhost:4222']);
    logger.info('Connected to NATS');

    const eventService = new EventService(redis);

    await setupNatsHandlers(eventService);
    const port = 3005;
    app.listen(port, () => {
      logger.info(`Event service listening on port ${port}`);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down');
      await shutdown();
    });
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down');
      await shutdown();
    });

    logger.info('Event service started and handlers registered');
  } catch (error) {
    logger.error('Failed to start event service', { error });
    process.exit(1);
  }
}

async function shutdown() {
  try {
    await gracefulShutdown();
    logger.info('NATS client disconnected');
    process.exit(0);
  } catch (err) {
    logger.error('Shutdown error', { err });
    process.exit(1);
  }
}

main();