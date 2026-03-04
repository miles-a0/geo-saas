import { Pool, PoolClient } from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
});

// Database helper functions
export const db = {
  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const result = await pool.query(text, params);
    return result.rows;
  },

  async queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] || null;
  },

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};

// Types for database tables
export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  stripe_customer_id: string | null;
  subscription_tier: 'free' | 'one_time' | 'monthly';
  subscription_status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'free';
  subscription_start_date: Date | null;
  subscription_end_date: Date | null;
  monthly_reports_remaining: number;
  total_reports_purchased: number;
  created_at: Date;
  updated_at: Date;
  email_verified: boolean;
  is_admin: boolean;
}

export interface Report {
  id: string;
  user_id: string;
  website_url: string;
  website_name: string | null;
  geo_score: number | null;
  ai_visibility_score: number | null;
  citability_score: number | null;
  brand_mentions_score: number | null;
  technical_score: number | null;
  content_score: number | null;
  schema_score: number | null;
  platform_score: number | null;
  report_data: Record<string, any> | null;
  pdf_path: string | null;
  pdf_filename: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  credit_used: number;
  created_at: Date;
  completed_at: Date | null;
}

export interface Payment {
  id: string;
  user_id: string;
  stripe_payment_intent_id: string | null;
  stripe_subscription_id: string | null;
  amount_paid: number;
  currency: string;
  payment_type: 'one_time' | 'subscription' | 'refund';
  credits_purchased: number | null;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  metadata: Record<string, any> | null;
  created_at: Date;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: 'purchase' | 'report_generation' | 'refund' | 'subscription_credit';
  payment_id: string | null;
  report_id: string | null;
  balance_after: number;
  created_at: Date;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  admin_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export interface ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  name: string | null;
  permissions: string[];
  last_used_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
}
