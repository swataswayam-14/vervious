import * as IORedis from 'ioredis';

export class RedisClient {
  private client: IORedis.Redis;
  private isConnected = false;

  constructor(private url: string = 'redis://localhost:6379') {
    this.client = new IORedis.Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.client.on('connect', () => {
      console.log('Connected to Redis');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      console.error('Redis connection error:', error);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log('Redis connection closed');
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
    }
  }

  getClient(): IORedis.Redis {
    return this.client;
  }
  
  async acquireLock(
    key: string,
    value: string,
    ttl: number = 10000,
    maxRetries: number = 3
  ): Promise<boolean> {
    const lockKey = `lock:${key}`;

    for (let i = 0; i < maxRetries; i++) {
      const result = await this.client.set(lockKey, value, 'PX', ttl, 'NX');

      if (result === 'OK') {
        return true;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 100)
      );
    }

    return false;
  }

  async releaseLock(key: string, value: string): Promise<boolean> {
    const lockKey = `lock:${key}`;

    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.client.eval(script, 1, lockKey, value);
    return result === 1;
  }

  async withLock<T>(
    key: string,
    operation: () => Promise<T>,
    ttl: number = 10000
  ): Promise<T> {
    const lockValue = `${Date.now()}-${Math.random()}`;
    const acquired = await this.acquireLock(key, lockValue, ttl);

    if (!acquired) {
      throw new Error(`Failed to acquire lock for key: ${key}`);
    }

    try {
      return await operation();
    } finally {
      await this.releaseLock(key, lockValue);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);

    if (ttl) {
      await this.client.setex(key, ttl, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async rateLimit(
    key: string,
    maxRequests: number,
    windowMs: number
  ): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowMs;

    const pipeline = this.client.pipeline();
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    pipeline.zcard(key);
    pipeline.expire(key, Math.ceil(windowMs / 1000));

    const results = await pipeline.exec();
    const count = results![2]?.[1] as number;

    return count <= maxRequests;
  }
}