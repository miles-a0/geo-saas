import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { db, User } from '../db/postgres.js';
import { logger } from '../utils/logger.js';

export interface AuthRequest extends Request {
  user?: User;
}

// JWT payload interface
interface JWTPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

// Generate access token
export function generateAccessToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email },
    config.jwtSecret,
    { expiresIn: '15m' }
  );
}

// Generate refresh token
export function generateRefreshToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email, type: 'refresh' },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

// Verify token
export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, config.jwtSecret) as JWTPayload;
}

// Authentication middleware
export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    // Fetch user from database
    const user = await db.queryOne<User>(
      'SELECT * FROM users WHERE id = $1',
      [payload.userId]
    );

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    if (!user.email_verified) {
      res.status(401).json({ error: 'Please verify your email first' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    logger.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// Optional authentication - doesn't fail if no token
export async function optionalAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    const user = await db.queryOne<User>(
      'SELECT * FROM users WHERE id = $1',
      [payload.userId]
    );

    if (user && user.email_verified) {
      req.user = user;
    }

    next();
  } catch {
    // Token invalid or expired, continue without auth
    next();
  }
}
