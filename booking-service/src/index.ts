import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { config } from 'dotenv';
import { connectNats } from './nats/client.js';
import { BookingService } from './services/booking.service.js';
import { setupBookingNatsHandlers } from './handlers/nats.handler.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middlewares/error.middleware.js';

config();

const app = express();
const PORT = process.env.BOOKING_SERVICE_PORT || 3003;

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'booking-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Booking Service API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      docs: '/api-docs' 
    }
  });
});

app.use(errorHandler);

app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});


async function startServer() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    const dbName = process.env.DB_NAME || 'auth_service';
    await mongoose.connect(mongoUri, { dbName });
    logger.info('Connected to MongoDB');

    await connectNats();
    logger.info('Connected to NATS');

    const bookingService = new BookingService();

    await setupBookingNatsHandlers(bookingService);

    app.listen(PORT, () => {
      logger.info(`Booking service started on port ${PORT}`);
      console.log(`🚀 Booking Service running on http://localhost:${PORT}`);
    });

    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully');
      
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
      
      const { getNatsClient } = await import('./nats/client.js');
      const natsClient = getNatsClient();
      await natsClient.disconnect();
      logger.info('NATS connection closed');
      
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start booking service:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();