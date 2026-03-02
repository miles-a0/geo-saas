import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import { db, User } from '../db/postgres.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Get user profile
router.get('/profile', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.first_name,
      lastName: req.user.last_name,
      company: req.user.company,
      isAdmin: req.user.is_admin,
      subscriptionTier: req.user.subscription_tier,
      subscriptionStatus: req.user.subscription_status,
      monthlyReportsRemaining: req.user.monthly_reports_remaining,
      totalReportsPurchased: req.user.total_reports_purchased,
      createdAt: req.user.created_at,
    },
  });
});

// Update user profile
router.put(
  '/profile',
  authenticate,
  [
    body('firstName').optional().isString().trim(),
    body('lastName').optional().isString().trim(),
    body('company').optional().isString().trim(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { firstName, lastName, company } = req.body;

      const [user] = await db.query<User>(
        `UPDATE users 
         SET first_name = COALESCE($1, first_name),
             last_name = COALESCE($2, last_name),
             company = COALESCE($3, company),
             updated_at = NOW()
         WHERE id = $4
         RETURNING id, email, first_name, last_name, company, is_admin`,
        [firstName, lastName, company, req.user?.id]
      );

      logger.info(`Profile updated for: ${user.email}`);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          company: user.company,
          isAdmin: user.is_admin,
        },
      });
    } catch (error) {
      logger.error('Profile update error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }
);

// Change password
router.put(
  '/password',
  authenticate,
  [
    body('currentPassword').isString(),
    body('newPassword').isLength({ min: 8 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { currentPassword, newPassword } = req.body;
      const userId = req.user?.id;

      // Get current password hash
      const user = await db.queryOne<User>(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) {
        res.status(400).json({ error: 'Current password is incorrect' });
        return;
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      await db.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newPasswordHash, userId]
      );

      logger.info(`Password changed for user: ${userId}`);

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      logger.error('Password change error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  }
);

// Get credit balance
router.get('/credits', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = await db.queryOne<User>(
    'SELECT monthly_reports_remaining, total_reports_purchased FROM users WHERE id = $1',
    [req.user.id]
  );

  res.json({
    credits: {
      available: user?.monthly_reports_remaining || 0,
      totalPurchased: user?.total_reports_purchased || 0,
    },
  });
});

// Get credit transaction history
router.get('/credit-history', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  const transactions = await db.query(
    `SELECT id, amount, transaction_type, balance_after, created_at
     FROM credit_transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );

  res.json({ transactions });
});

export default router;
