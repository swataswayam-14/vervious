import express from 'express';
import cors from 'cors'; 
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import yaml from 'yaml';
import fs from 'fs';
import path from 'path';
import { connectNats, getNatsClient } from './nats/client.js';
import { RedisClient } from './redis/client.js';
import { logger } from './utils/logger.js';
import { authRoutes } from './routes/auth.routes.js';
import { eventRoutes } from './routes/event.routes.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import {type ApiResponse } from './types/message.types.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { bookingRoutes } from './routes/booking.routes.js';

dotenv.config();

export class ApiGateway {
  private app: express.Application;
  private redisClient: RedisClient;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000');
    this.redisClient = new RedisClient(process.env.REDIS_URL);

    this.setupMiddleware();
    this.setupSwaggerDocs();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupDatabase();
  }

  private async setupDatabase(): Promise<void> {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017';
    const DB_NAME = process.env.DB_NAME || 'auth_service';

    await mongoose.connect(MONGO_URI, {
      dbName: DB_NAME
    });
    logger.info('MongoDB connected');
  }

  private setupMiddleware(): void {
    this.app.use(helmet());

    this.app.use(
      cors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') || [
          'http://localhost:3000',
          'http://135.235.247.214:3000',
        ],
        credentials: true,
      })
    );

    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000,
      skip: (req) => req.path.startsWith('/docs'), // Skip rate limiting for docs
    });
    this.app.use('/api', limiter);

    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        correlationId: req.headers['x-correlation-id'],
      });
      next();
    });
  }

  private setupSwaggerDocs(): void {
    try {
      const swaggerPath = path.join(process.cwd(), 'docs', 'openapi.yml');
      let swaggerDocument;
      if (fs.existsSync(swaggerPath)) {
        const file = fs.readFileSync(swaggerPath, 'utf8');
        swaggerDocument = yaml.parse(file);
      } else {
        swaggerDocument = this.getInlineSwaggerSpec();
      }

      const swaggerOptions = {
        explorer: true,
        swaggerOptions: {
          docExpansion: 'none',
          defaultModelsExpandDepth: 2,
          defaultModelExpandDepth: 2,
          displayRequestDuration: true,
          tryItOutEnabled: true,
          filter: true,
          showExtensions: true,
          showCommonExtensions: true,
        },
        customCss: `
          .swagger-ui .topbar { display: none }
          .swagger-ui .info h1 { color: #3b82f6 }
          .swagger-ui .scheme-container { background: #f8fafc; padding: 20px; border-radius: 8px; }
        `,
        customSiteTitle: "Event Booking API Documentation",
        customfavIcon: "/favicon.ico",
      };

      this.app.use(
        '/docs',
        swaggerUi.serve,
        swaggerUi.setup(swaggerDocument, swaggerOptions)
      );
      //this.app.get('/docs', swaggerUi.setup(swaggerDocument, swaggerOptions));

      this.app.get('/docs/json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerDocument);
      });

      this.app.get('/docs/yaml', (req, res) => {
        res.setHeader('Content-Type', 'application/x-yaml');
        res.send(yaml.stringify(swaggerDocument));
      });

      logger.info('Swagger documentation setup complete at /docs');
    } catch (error) {
      logger.error('Failed to setup Swagger documentation:', error);
    }
  }

  private getInlineSwaggerSpec(): any {
    return {
      openapi: '3.0.3',
      info: {
        title: 'Event Booking API Gateway',
        description: 'A comprehensive API for managing events, bookings, and user authentication.',
        version: '1.0.0',
      },
      servers: [
        {
          url: `135.235.247.214:${this.port}`,
          description: 'Production server',
        },
      ],
      paths: {
        '/health': {
          get: {
            tags: ['Health'],
            summary: 'Health check endpoint',
            responses: {
              '200': {
                description: 'Service is healthy',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: {
                          type: 'object',
                          properties: {
                            status: { type: 'string' },
                            timestamp: { type: 'string' },
                            services: {
                              type: 'object',
                              properties: {
                                nats: { type: 'boolean' },
                                redis: { type: 'boolean' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    };
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      const natsClient = getNatsClient();
      const response: ApiResponse = {
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            nats: natsClient.isConnectionActive(),
            redis: this.redisClient.getClient().status === 'ready',
          },
        },
      };
      res.json(response);
    });

    this.app.get('/api', (req, res) => {
      const response: ApiResponse = {
        success: true,
        data: {
          name: 'Event Booking API Gateway',
          version: '1.0.0',
          description: 'A comprehensive API for managing events, bookings, and user authentication',
          documentation: `${req.protocol}://${req.get('host')}/docs`,
          endpoints: {
            auth: '/api/auth',
            events: '/api/events',
            bookings: '/api/bookings',
          },
        },
      };
      res.json(response);
    });

    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/events', eventRoutes);
    this.app.use('/api/bookings', authMiddleware, bookingRoutes);

    this.app.use((req, res) => {
      const response: ApiResponse = {
        success: false,
        error: 'Route not found',
      };
      res.status(404).json(response);
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  async start(): Promise<void> {
    try {
      await connectNats(
        process.env.NATS_URL?.split(',') || ['nats://nats:4222']
      );
      await this.redisClient.connect();

      this.app.listen(this.port, () => {
        logger.info(`API Gateway started on port ${this.port}`);
        logger.info(`API Documentation available at http://localhost:${this.port}/docs`);
        logger.info(`Health check available at http://localhost:${this.port}/health`);
        logger.info(`OpenAPI spec available at http://localhost:${this.port}/docs/json`);
      });

      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully');
        await this.shutdown();
      });

      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully');
        await this.shutdown();
      });
    } catch (error) {
      logger.error('Failed to start API Gateway:', error);
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    try {
      const natsClient = getNatsClient();
      await natsClient.disconnect();
      await this.redisClient.disconnect();
      logger.info('API Gateway shut down completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}