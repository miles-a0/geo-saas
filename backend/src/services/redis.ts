import { createClient, RedisClientType } from 'redis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let redisClient: RedisClientType;

export async function connectRedis(): Promise<RedisClientType> {
  if (redisClient) return redisClient;

  redisClient = createClient({
    url: config.redisUrl,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('Max reconnection attempts reached');
          return new Error('Max reconnection attempts reached');
        }
        return Math.min(retries * 100, 3000);
      },
    },
  });

  redisClient.on('error', (err) => {
    logger.error('Redis error:', err);
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected');
  });

  redisClient.on('reconnecting', () => {
    logger.info('Redis reconnecting...');
  });

  await redisClient.connect();
  return redisClient;
}

export async function getRedis(): Promise<RedisClientType> {
  if (!redisClient) {
    return connectRedis();
  }
  return redisClient;
}

// Cache helpers
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const client = await getRedis();
    const value = await client.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  },

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const client = await getRedis();
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await client.setEx(key, ttlSeconds, serialized);
    } else {
      await client.set(key, serialized);
    }
  },

  async del(key: string): Promise<void> {
    const client = await getRedis();
    await client.del(key);
  },

  async increment(key: string): Promise<number> {
    const client = await getRedis();
    return client.incr(key);
  },

  async expire(key: string, seconds: number): Promise<void> {
    const client = await getRedis();
    await client.expire(key, seconds);
  },
};

// Session management
export const sessions = {
  async create(userId: string, token: string, expiresInSeconds: number): Promise<void> {
    const client = await getRedis();
    await client.setEx(`session:${token}`, expiresInSeconds, userId);
  },

  async get(token: string): Promise<string | null> {
    const client = await getRedis();
    return client.get(`session:${token}`);
  },

  async destroy(token: string): Promise<void> {
    const client = await getRedis();
    await client.del(`session:${token}`);
  },
};

// Rate limiting
export const rateLimiter = {
  async check(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const client = await getRedis();
    const current = await client.incr(`ratelimit:${key}`);
    if (current === 1) {
      await client.expire(`ratelimit:${key}`, windowSeconds);
    }
    return current <= limit;
  },
};

export const connection = {
  url: config.redisUrl,
};

export const redis = {
  client: () => getRedis(),
  cache,
  sessions,
  rateLimiter,
  ping: async () => {
    const client = await getRedis();
    return client.ping();
  },
};
