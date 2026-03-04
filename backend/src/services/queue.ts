import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getRedis } from './redis.js';
import { db, User } from '../db/postgres.js';

export interface ReportJobData {
  reportId: string;
  userId: string;
  websiteUrl: string;
  websiteName?: string;
}

// Add report to queue (simple Redis list for Python worker)
export async function queueReport(
  reportId: string,
  userId: string,
  websiteUrl: string,
  websiteName?: string,
  priority: 'high' | 'normal' | 'low' = 'normal'
): Promise<void> {
  const redis = await getRedis();
  
  // Fetch user's email
  const user = await db.queryOne<User>(
    'SELECT email FROM users WHERE id = $1',
    [userId]
  );
  
  const jobData = {
    report_id: reportId,
    website_url: websiteUrl,
    target_keywords: [],
    user_email: user?.email || '',
  };

  // Push to the queue that the Python worker listens on
  await redis.lPush('queue:reports', JSON.stringify(jobData));

  logger.info(`Report ${reportId} queued for processing`);
}

// Get queue stats
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  const redis = await getRedis();
  
  const waiting = await redis.lLen('queue:reports');
  
  return {
    waiting: waiting || 0,
    active: 0,
    completed: 0,
    failed: 0
  };
}

// Clean old jobs
export async function cleanOldJobs(): Promise<void> {
  // Not applicable for simple Redis list
  logger.info('Clean old jobs not implemented for simple queue');
}
