import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { db, Report, User } from '../db/postgres.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { queueReport } from '../services/queue.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { sendEmail } from '../services/email.js';
import path from 'path';

const router = Router();

// List user's reports
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    let query = `
      SELECT id, website_url, website_name, geo_score, status, credit_used, created_at, completed_at
      FROM reports
      WHERE user_id = $1
    `;
    const params: any[] = [req.user?.id];

    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const reports = await db.query<Report>(query, params);

    res.json({ reports });
  } catch (error) {
    logger.error('List reports error:', error);
    res.status(500).json({ error: 'Failed to list reports' });
  }
});

// Get single report
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const report = await db.queryOne<Report>(
      `SELECT * FROM reports WHERE id = $1 AND user_id = $2`,
      [id, req.user?.id]
    );

    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    res.json({ report });
  } catch (error) {
    logger.error('Get report error:', error);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

// Create new report
router.post(
  '/',
  authenticate,
  [
    body('websiteUrl').isURL({ require_protocol: true, require_host: true }),
    body('websiteName').optional().isString().trim(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { websiteUrl, websiteName } = req.body;
      const userId = req.user?.id;
      const isAdmin = req.user?.is_admin || false;

      // Get user info (including admin status)
      const user = await db.queryOne<User>(
        'SELECT monthly_reports_remaining, is_admin FROM users WHERE id = $1',
        [userId]
      );

      // Admin users have unlimited credits
      const userIsAdmin = user?.is_admin || false;

      // Check user has credits (skip for admins)
      if (!userIsAdmin && (!user || user.monthly_reports_remaining < 1)) {
        res.status(402).json({ error: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS' });
        return;
      }

      // Create report record
      const [report] = await db.query<Report>(
        `INSERT INTO reports (user_id, website_url, website_name, status, credit_used, created_at)
         VALUES ($1, $2, $3, 'pending', 1, NOW())
         RETURNING id, website_url, website_name, status, credit_used, created_at`,
        [userId, websiteUrl, websiteName || null]
      );

      // Deduct credit only for non-admin users
      if (!userIsAdmin) {
        await db.query(
          `UPDATE users
           SET monthly_reports_remaining = monthly_reports_remaining - 1,
               total_reports_purchased = total_reports_purchased + 1,
               updated_at = NOW()
           WHERE id = $1`,
          [userId]
        );

        // Record credit transaction
        const newBalance = (user?.monthly_reports_remaining || 0) - 1;
        await db.query(
          `INSERT INTO credit_transactions (user_id, amount, transaction_type, balance_after, created_at)
           VALUES ($1, -1, 'report_generation', $2, NOW())`,
          [userId, newBalance]
        );
      }

      // Queue report for processing
      await queueReport(report.id, userId!, websiteUrl, websiteName);

      logger.info(`Report queued: ${report.id} for user: ${userId}`);

      res.status(201).json({
        report: {
          id: report.id,
          websiteUrl: report.website_url,
          websiteName: report.website_name,
          status: report.status,
          createdAt: report.created_at,
        },
      });
    } catch (error) {
      logger.error('Create report error:', error);
      res.status(500).json({ error: 'Failed to create report' });
    }
  }
);

// Download report PDF
router.get('/:id/download', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const report = await db.queryOne<Report>(
      `SELECT pdf_path, pdf_filename, website_name, status
       FROM reports WHERE id = $1 AND user_id = $2`,
      [id, req.user?.id]
    );

    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    if (report.status !== 'completed') {
      res.status(400).json({ error: 'Report is not ready for download' });
      return;
    }

    if (!report.pdf_filename) {
      res.status(404).json({ error: 'PDF file not found' });
      return;
    }

    // Serve the file
    const filePath = path.join(config.reportStorageDir, report.pdf_filename);
    const filename = report.pdf_filename || `GEO-Report-${report.website_name || 'Unknown'}.pdf`;

    res.download(filePath, filename, (err) => {
      if (err) {
        logger.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to download report' });
        }
      }
    });
  } catch (error) {
    logger.error('Download report error:', error);
    res.status(500).json({ error: 'Failed to download report' });
  }
});

// Delete report
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `DELETE FROM reports WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.user?.id]
    );

    if (result.length === 0) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    logger.info(`Report deleted: ${id}`);

    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    logger.error('Delete report error:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

// Worker callback to update report status (no auth required for internal worker calls)
router.post('/:id/complete', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, score, pdf_filename } = req.body;

    if (!status || !['completed', 'failed'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    await db.query(
      `UPDATE reports
       SET status = $1,
           geo_score = $2,
           pdf_filename = $3,
           completed_at = NOW()
       WHERE id = $4`,
      [status, score || null, pdf_filename || null, id]
    );

    logger.info(`Report ${id} marked as ${status}`);

    res.json({ success: true });
  } catch (error) {
    logger.error('Complete report error:', error);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// Worker callback to send report email
router.post('/:id/send-email', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { to, subject, reportId, websiteUrl, score, pdfFilename } = req.body;

    const report = await db.queryOne<Report>(
      'SELECT * FROM reports WHERE id = $1',
      [id]
    );

    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    const user = await db.queryOne<User>(
      'SELECT first_name, email FROM users WHERE id = $1',
      [report.user_id]
    );

    // Send email with PDF attachment
    const pdfPath = path.join(config.reportStorageDir, pdfFilename);
    
    await sendEmail({
      to: to || user?.email,
      template: 'reportComplete',
      data: {
        firstName: user?.first_name || 'there',
        websiteName: websiteUrl || report.website_url,
        geoScore: score || report.geo_score || 0,
        downloadUrl: `${config.frontendUrl}/reports/${id}/download`,
      },
      attachment: {
        filename: pdfFilename || `report-${id}.pdf`,
        path: pdfPath,
      },
    });

    logger.info(`Report email sent for ${id} to ${to || user?.email}`);

    res.json({ success: true });
  } catch (error) {
    logger.error('Send report email error:', error);
    res.status(500).json({ error: 'Failed to send report email' });
  }
});

export default router;
