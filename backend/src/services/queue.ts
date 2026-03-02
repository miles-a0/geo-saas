import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { connection } from './redis.js';

export interface ReportJobData {
  reportId: string;
  userId: string;
  websiteUrl: string;
  websiteName?: string;
}

export const reportQueue = new Queue<ReportJobData>('report-generation', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 100,
      age: 86400,
    },
    removeOnFail: {
      count: 500,
      age: 604800,
    },
  },
});

// Report job processor
export async function processReportJob(job: Job<ReportJobData>): Promise<any> {
  const { reportId, userId, websiteUrl, websiteName } = job.data;
  logger.info(`Processing report ${reportId} for ${websiteUrl}`);

  // This will be handled by the Python worker
  // The job data is stored in Redis and picked up by the worker
  // For now, we'll mark it as processing in the database
  const { pool } = await import('../db/postgres.js');
  
  await pool.query(
    'UPDATE reports SET status = $1, updated_at = NOW() WHERE id = $2',
    ['processing', reportId]
  );

  // Return job data for the worker to pick up
  return {
    reportId,
    userId,
    websiteUrl,
    websiteName: websiteName || websiteUrl,
  };
}

// Add report to queue
export async function queueReport(
  reportId: string,
  userId: string,
  websiteUrl: string,
  websiteName?: string,
  priority: 'high' | 'normal' | 'low' = 'normal'
): Promise<void> {
  const jobOptions = {
    priority: priority === 'high' ? 1 : priority === 'low' ? 3 : 2,
  };

  await reportQueue.add(
    'generate' as any,
    { reportId, userId, websiteUrl, websiteName },
    jobOptions
  );

  logger.info(`Report ${reportId} queued for processing`);
}

// Get queue stats
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  const [waiting, active, completed, failed] = await Promise.all([
    reportQueue.getWaitingCount(),
    reportQueue.getActiveCount(),
    reportQueue.getCompletedCount(),
    reportQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

// Clean old jobs
export async function cleanOldJobs(): Promise<void> {
  await reportQueue.clean(86400000, 100, 'completed'); // Clean jobs older than 1 day
  await reportQueue.clean(604800000, 100, 'failed'); // Clean failed jobs older than 7 days
}
