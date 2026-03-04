import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Environment
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001'),
  
  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://geosaas:geosaas@localhost:5432/geosaas',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'geosaas',
    password: process.env.DB_PASSWORD || 'geosaas',
    database: process.env.DB_NAME || 'geosaas_prod',
  },
  
  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  
  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    productIndividual: process.env.STRIPE_PRODUCT_INDIVIDUAL || '',
    productSubscription: process.env.STRIPE_PRODUCT_SUBSCRIPTION || '',
    priceIndividual: process.env.STRIPE_PRICE_INDIVIDUAL || '',
    priceSubscription: process.env.STRIPE_PRICE_SUBSCRIPTION || '',
  },
  
  // Email
  email: {
    host: process.env.EMAIL_HOST || '',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'noreply@localhost',
    fromName: process.env.EMAIL_FROM_NAME || 'G-SEO',
  },
  
  // Frontend
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  domain: process.env.DOMAIN || 'localhost',
  
  // Storage
  uploadDir: process.env.UPLOAD_DIR || '/app/uploads',
  reportStorageDir: process.env.REPORT_STORAGE_DIR || '/app/reports',
  
  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  },
  
  // Worker
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '3'),
    timeout: parseInt(process.env.WORKER_TIMEOUT_MS || '300000'),
  },
};
