import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { db, User, Report, Payment, AuditLog } from '../db/postgres.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { queueReport } from '../services/queue.js';
import { logger } from '../utils/logger.js';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Dashboard analytics
router.get('/analytics', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [
      totalUsers,
      totalReports,
      completedReports,
      pendingReports,
      totalRevenue,
      recentUsers,
      recentReports,
    ] = await Promise.all([
      db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users'),
      db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM reports'),
      db.queryOne<{ count: string }>("SELECT COUNT(*) as count FROM reports WHERE status = 'completed'"),
      db.queryOne<{ count: string }>("SELECT COUNT(*) as count FROM reports WHERE status = 'pending'"),
      db.queryOne<{ total: string }>("SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments WHERE status = 'succeeded'"),
      db.query<User>(
        'SELECT id, email, first_name, last_name, created_at FROM users ORDER BY created_at DESC LIMIT 5'
      ),
      db.query<Report>(
        "SELECT r.id, r.website_url, r.status, r.geo_score, r.created_at, u.email FROM reports r JOIN users u ON r.user_id = u.id ORDER BY r.created_at DESC LIMIT 10"
      ),
    ]);

    // Get subscription stats
    const subscriptionStats = await db.query<{ tier: string; count: string }>(
      "SELECT subscription_tier as tier, COUNT(*) as count FROM users GROUP BY subscription_tier"
    );

    res.json({
      analytics: {
        totalUsers: parseInt(totalUsers?.count || '0'),
        totalReports: parseInt(totalReports?.count || '0'),
        completedReports: parseInt(completedReports?.count || '0'),
        pendingReports: parseInt(pendingReports?.count || '0'),
        totalRevenue: parseInt(totalRevenue?.total || '0') / 100,
        subscriptionStats,
      },
      recentUsers,
      recentReports,
    });
  } catch (error) {
    logger.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// List all users
router.get('/users', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search as string;

    let query = `
      SELECT id, email, first_name, last_name, company, subscription_tier, 
             subscription_status, monthly_reports_remaining, created_at, is_admin
      FROM users
    `;
    const params: any[] = [];

    if (search) {
      query += ` WHERE email ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const users = await db.query<User>(query, params);

    // Get total count
    const countQuery = search 
      ? `SELECT COUNT(*) as count FROM users WHERE email ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1`
      : 'SELECT COUNT(*) as count FROM users';
    const countParams = search ? [`%${search}%`] : [];
    const total = await db.queryOne<{ count: string }>(countQuery, countParams);

    res.json({ users, total: parseInt(total?.count || '0') });
  } catch (error) {
    logger.error('Admin list users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Get single user details
router.get('/users/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await db.queryOne<User>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get user's reports
    const reports = await db.query(
      `SELECT id, website_url, geo_score, status, credit_used, created_at 
       FROM reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [id]
    );

    // Get payment history
    const payments = await db.query(
      `SELECT id, amount_paid, currency, payment_type, credits_purchased, status, created_at
       FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [id]
    );

    res.json({ user, reports, payments });
  } catch (error) {
    logger.error('Admin get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update user
router.put(
  '/users/:id',
  [
    body('firstName').optional().isString().trim(),
    body('lastName').optional().isString().trim(),
    body('company').optional().isString().trim(),
    body('isAdmin').optional().isBoolean(),
    body('subscriptionTier').optional().isIn(['free', 'one_time', 'monthly']),
    body('subscriptionStatus').optional().isIn(['active', 'canceled', 'past_due', 'trialing', 'free']),
    body('monthlyReportsRemaining').optional().isInt({ min: 0 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { id } = req.params;
      const { firstName, lastName, company, isAdmin, subscriptionTier, subscriptionStatus, monthlyReportsRemaining } = req.body;

      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (firstName !== undefined) {
        updates.push(`first_name = $${paramIndex++}`);
        params.push(firstName);
      }
      if (lastName !== undefined) {
        updates.push(`last_name = $${paramIndex++}`);
        params.push(lastName);
      }
      if (company !== undefined) {
        updates.push(`company = $${paramIndex++}`);
        params.push(company);
      }
      if (isAdmin !== undefined) {
        updates.push(`is_admin = $${paramIndex++}`);
        params.push(isAdmin);
      }
      if (subscriptionTier !== undefined) {
        updates.push(`subscription_tier = $${paramIndex++}`);
        params.push(subscriptionTier);
      }
      if (subscriptionStatus !== undefined) {
        updates.push(`subscription_status = $${paramIndex++}`);
        params.push(subscriptionStatus);
      }
      if (monthlyReportsRemaining !== undefined) {
        updates.push(`monthly_reports_remaining = $${paramIndex++}`);
        params.push(monthlyReportsRemaining);
      }

      if (updates.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      updates.push(`updated_at = NOW()`);
      params.push(id);

      const [user] = await db.query<User>(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        params
      );

      // Log action
      await db.query(
        `INSERT INTO audit_logs (admin_id, user_id, action, entity_type, entity_id, created_at)
         VALUES ($1, $2, 'update', 'user', $3, NOW())`,
        [req.user?.id, user.id, id]
      );

      logger.info(`Admin updated user: ${id}`);

      res.json({ user });
    } catch (error) {
      logger.error('Admin update user error:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  }
);

// Delete user
router.delete('/users/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (id === req.user?.id) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    await db.query('DELETE FROM users WHERE id = $1', [id]);

    // Log action
    await db.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, created_at)
       VALUES ($1, 'delete', 'user', $2, NOW())`,
      [req.user?.id, id]
    );

    logger.info(`Admin deleted user: ${id}`);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Admin delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Add credits to user
router.post(
  '/users/:id/add-credits',
  [
    body('credits').isInt({ min: 1, max: 100 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { id } = req.params;
      const { credits } = req.body;

      const user = await db.queryOne<User>(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const newBalance = user.monthly_reports_remaining + credits;

      await db.query(
        `UPDATE users 
         SET monthly_reports_remaining = $1,
             total_reports_purchased = total_reports_purchased + $2,
             updated_at = NOW()
         WHERE id = $3`,
        [newBalance, credits, id]
      );

      // Record transaction
      await db.query(
        `INSERT INTO credit_transactions (user_id, amount, transaction_type, balance_after, created_at)
         VALUES ($1, $2, 'purchase', $3, NOW())`,
        [id, credits, newBalance]
      );

      // Log action
      await db.query(
        `INSERT INTO audit_logs (admin_id, user_id, action, entity_type, entity_id, new_value, created_at)
         VALUES ($1, $2, 'add_credits', 'user', $3, $4, NOW())`,
        [req.user?.id, id, id, { credits, newBalance }]
      );

      logger.info(`Admin added ${credits} credits to user ${id}`);

      res.json({ 
        message: 'Credits added successfully',
        newBalance,
      });
    } catch (error) {
      logger.error('Admin add credits error:', error);
      res.status(500).json({ error: 'Failed to add credits' });
    }
  }
);

// List all reports
router.get('/reports', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;
    const userId = req.query.userId as string;

    let query = `
      SELECT r.*, u.email as user_email
      FROM reports r
      JOIN users u ON r.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND r.status = $${paramIndex++}`;
      params.push(status);
    }
    if (userId) {
      query += ` AND r.user_id = $${paramIndex++}`;
      params.push(userId);
    }

    query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const reports = await db.query(query, params);

    res.json({ reports });
  } catch (error) {
    logger.error('Admin list reports error:', error);
    res.status(500).json({ error: 'Failed to list reports' });
  }
});

// Regenerate report
router.post('/reports/:id/regenerate', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const report = await db.queryOne<Report>(
      'SELECT * FROM reports WHERE id = $1',
      [id]
    );

    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    // Update status to pending
    await db.query(
      `UPDATE reports SET status = 'pending', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // Queue for regeneration
    await queueReport(id, report.user_id, report.website_url, report.website_name || undefined);

    // Log action
    await db.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, created_at)
       VALUES ($1, 'regenerate', 'report', $2, NOW())`,
      [req.user?.id, id]
    );

    logger.info(`Admin regenerated report: ${id}`);

    res.json({ message: 'Report queued for regeneration' });
  } catch (error) {
    logger.error('Admin regenerate report error:', error);
    res.status(500).json({ error: 'Failed to regenerate report' });
  }
});

// Get audit logs
router.get('/audit-logs', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const logs = await db.query<AuditLog>(
      `SELECT al.*, u.email as admin_email 
       FROM audit_logs al
       LEFT JOIN users u ON al.admin_id = u.id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ logs });
  } catch (error) {
    logger.error('Audit logs error:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

export default router;
