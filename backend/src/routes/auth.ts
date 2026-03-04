import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import { db, User } from '../db/postgres.js';
import { generateAccessToken, generateRefreshToken, verifyToken, AuthRequest, authenticate } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
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

      const { email, password, firstName, lastName, company } = req.body;

      // Check if user exists
      const existingUser = await db.queryOne<User>(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingUser) {
        res.status(400).json({ error: 'Email already registered' });
        return;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const [user] = await db.query<User>(
        `INSERT INTO users (email, password_hash, first_name, last_name, company, email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
         RETURNING id, email, first_name, last_name, company, is_admin, created_at`,
        [email, passwordHash, firstName || null, lastName || null, company || null]
      );

      // Generate tokens
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      logger.info(`New user registered: ${email}`);

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          company: user.company,
          isAdmin: user.is_admin,
        },
        accessToken,
        refreshToken,
      });
    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// Login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isString(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { email, password } = req.body;

      // Find user
      const user = await db.queryOne<User>(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Generate tokens
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      logger.info(`User logged in: ${email}`);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          company: user.company,
          isAdmin: user.is_admin,
          subscriptionTier: user.subscription_tier,
          subscriptionStatus: user.subscription_status,
          monthlyReportsRemaining: user.monthly_reports_remaining,
        },
        accessToken,
        refreshToken,
      });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Refresh token
router.post(
  '/refresh',
  [
    body('refreshToken').isString(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      const payload = verifyToken(refreshToken);
      
      if ((payload as any).type !== 'refresh') {
        res.status(401).json({ error: 'Invalid refresh token' });
        return;
      }

      const user = await db.queryOne<User>(
        'SELECT * FROM users WHERE id = $1',
        [payload.userId]
      );

      if (!user || !user.email_verified) {
        res.status(401).json({ error: 'User not found or not verified' });
        return;
      }

      const newAccessToken = generateAccessToken(user);

      res.json({ accessToken: newAccessToken });
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        res.status(401).json({ error: 'Refresh token expired' });
        return;
      }
      res.status(401).json({ error: 'Invalid refresh token' });
    }
  }
);

// Logout (client-side token removal, but we can log it)
router.post('/logout', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  logger.info(`User logged out: ${req.user?.email}`);
  res.json({ message: 'Logged out successfully' });
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
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

export default router;
