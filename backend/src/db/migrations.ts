import { pool } from './postgres.js';

const migrations = `
-- Enable UUID extension first (required for gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  company VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  subscription_tier VARCHAR(20) DEFAULT 'free' CHECK (subscription_tier IN ('free', 'one_time', 'monthly')),
  subscription_status VARCHAR(20) DEFAULT 'free' CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'trialing', 'free')),
  subscription_start_date TIMESTAMP,
  subscription_end_date TIMESTAMP,
  monthly_reports_remaining INTEGER DEFAULT 0,
  total_reports_purchased INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  email_verified BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  website_url VARCHAR(2048) NOT NULL,
  website_name VARCHAR(255),
  geo_score INTEGER,
  ai_visibility_score INTEGER,
  citability_score INTEGER,
  brand_mentions_score INTEGER,
  technical_score INTEGER,
  content_score INTEGER,
  schema_score INTEGER,
  platform_score INTEGER,
  report_data JSONB,
  pdf_path VARCHAR(512),
  pdf_filename VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  credit_used INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255),
  amount_paid INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'gbp',
  payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('one_time', 'subscription', 'refund')),
  credits_purchased INTEGER,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Credit transactions table
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('purchase', 'report_generation', 'refund', 'subscription_credit')),
  payment_id UUID REFERENCES payments(id),
  report_id UUID REFERENCES reports(id),
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  permissions JSONB DEFAULT '["read"]',
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_website_url ON reports(website_url);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe ON payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`;

export async function runMigrations(): Promise<void> {
  console.log('Running database migrations...');
  
  const statements = migrations.split(';').filter(s => s.trim());
  
  for (const statement of statements) {
    if (statement.trim()) {
      await pool.query(statement);
    }
  }
  
  console.log('Migrations completed successfully');
}

export async function seedDatabase(): Promise<void> {
  console.log('Seeding database...');
  
  // Check if admin exists
  const adminExists = await pool.query("SELECT id FROM users WHERE email = 'admin@geosaas.com'");
  
  if (adminExists.rows.length === 0) {
    // Create default admin user (password: admin123)
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_admin, email_verified, subscription_tier, subscription_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['admin@geosaas.com', hashedPassword, 'Admin', 'User', true, true, 'free', 'free']
    );
    
    console.log('Default admin user created: admin@geosaas.com / admin123');
  }
  
  console.log('Seeding completed');
}
