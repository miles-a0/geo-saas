import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import Stripe from 'stripe';
import { db, User, Payment } from '../db/postgres.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { 
  getOrCreateCustomer, 
  createCheckoutSession, 
  createSubscriptionSession,
  verifyWebhookSignature 
} from '../services/stripe.js';
import { sendEmail } from '../services/email.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Create checkout for one-time credit purchase
router.post(
  '/create-checkout',
  authenticate,
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

      const { credits } = req.body;
      const user = req.user!;

      // Get or create Stripe customer
      const stripeCustomer = await getOrCreateCustomer(
        user.email,
        `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        user.stripe_customer_id || undefined
      );

      // Update user's Stripe customer ID
      if (!user.stripe_customer_id) {
        await db.query(
          'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
          [stripeCustomer.id, user.id]
        );
      }

      // Create checkout session
      const session = await createCheckoutSession({
        customerId: stripeCustomer.id,
        email: user.email,
        credits,
        successUrl: `${config.frontendUrl}/billing?success=true`,
        cancelUrl: `${config.frontendUrl}/billing?canceled=true`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      logger.error('Create checkout error:', error);
      const errorMessage = error.message || 'Failed to create checkout session';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// Create subscription checkout
router.post(
  '/create-subscription',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;

      // Get or create Stripe customer
      const stripeCustomer = await getOrCreateCustomer(
        user.email,
        `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        user.stripe_customer_id || undefined
      );

      // Update user's Stripe customer ID
      if (!user.stripe_customer_id) {
        await db.query(
          'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
          [stripeCustomer.id, user.id]
        );
      }

      // Create subscription checkout session
      const session = await createSubscriptionSession({
        customerId: stripeCustomer.id,
        email: user.email,
        successUrl: `${config.frontendUrl}/billing?success=true`,
        cancelUrl: `${config.frontendUrl}/billing?canceled=true`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      logger.error('Create subscription error:', error);
      const errorMessage = error.message || 'Failed to create subscription';
      res.status(500).json({ error: errorMessage });
    }
  }
);

// Get payment history
router.get('/history', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const payments = await db.query<Payment>(
      `SELECT id, amount_paid, currency, payment_type, credits_purchased, status, created_at
       FROM payments
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user?.id, limit, offset]
    );

    res.json({ payments });
  } catch (error) {
    logger.error('Payment history error:', error);
    res.status(500).json({ error: 'Failed to get payment history' });
  }
});

// Cancel subscription
router.post('/cancel-subscription', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;

    if (user.subscription_tier !== 'monthly') {
      res.status(400).json({ error: 'No active subscription' });
      return;
    }

    // This would cancel the Stripe subscription
    // For now, we'll handle it through Stripe Customer Portal
    res.json({ 
      message: 'Please visit the billing portal to manage your subscription',
      // In production, call cancelSubscription here
    });
  } catch (error) {
    logger.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Stripe webhook handler (exported for use in index.ts)
export async function handleWebhook(req: any, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'];

  try {
    const event = verifyWebhookSignature(req.body, sig);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCanceled(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(400).json({ error: 'Webhook error' });
  }
}

// Webhook handlers
async function handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
  const customerId = session.customer as string;
  const metadata = session.metadata || {};

  if (session.mode === 'payment' && metadata.type === 'one_time') {
    const credits = parseInt(metadata.credits || '1');
    const user = await db.queryOne<User>(
      'SELECT * FROM users WHERE stripe_customer_id = $1',
      [customerId]
    );

    if (user) {
      // Add credits
      await db.query(
        `UPDATE users 
         SET monthly_reports_remaining = monthly_reports_remaining + $1,
             total_reports_purchased = total_reports_purchased + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [credits, user.id]
      );

      // Record payment
      await db.query(
        `INSERT INTO payments (user_id, stripe_payment_intent_id, amount_paid, currency, payment_type, credits_purchased, status, created_at)
         VALUES ($1, $2, $3, 'gbp', 'one_time', $4, 'succeeded', NOW())`,
        [user.id, session.payment_intent, session.amount_total, credits]
      );

      // Record credit transaction
      const newBalance = user.monthly_reports_remaining + credits;
      await db.query(
        `INSERT INTO credit_transactions (user_id, amount, transaction_type, balance_after, created_at)
         VALUES ($1, $2, 'purchase', $3, NOW())`,
        [user.id, credits, newBalance]
      );

      // Send confirmation email
      await sendEmail({
        to: user.email,
        template: 'paymentReceipt',
        data: {
          firstName: user.first_name || 'there',
          description: `${credits} Report Credit${credits > 1 ? 's' : ''}`,
          amount: (session.amount_total! / 100).toFixed(2),
          credits: credits.toString(),
          transactionId: session.payment_intent || 'N/A',
        },
      });

      logger.info(`Payment completed: ${credits} credits added to user ${user.id}`);
    }
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;
  
  const user = await db.queryOne<User>(
    'SELECT * FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (user) {
    const isActive = subscription.status === 'active';
    
    await db.query(
      `UPDATE users 
       SET subscription_tier = $1,
           subscription_status = $2,
           subscription_start_date = $3,
           subscription_end_date = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [
        'monthly',
        isActive ? 'active' : 'past_due',
        new Date(subscription.current_period_start * 1000),
        new Date(subscription.current_period_end * 1000),
        user.id
      ]
    );

    logger.info(`Subscription updated for user ${user.id}: ${subscription.status}`);
  }
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;
  
  const user = await db.queryOne<User>(
    'SELECT * FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (user) {
    await db.query(
      `UPDATE users 
       SET subscription_tier = 'free',
           subscription_status = 'canceled',
           updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    await sendEmail({
      to: user.email,
      template: 'subscriptionConfirmation',
      data: {
        firstName: user.first_name || 'there',
        reportsPerYear: '12',
        renewalDate: 'Subscription ended',
      },
    });

    logger.info(`Subscription canceled for user ${user.id}`);
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  
  const user = await db.queryOne<User>(
    'SELECT * FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (user && invoice.subscription) {
    // Add monthly credits (12 per year = 1 per month)
    const monthlyCredits = 1;
    
    await db.query(
      `UPDATE users 
       SET monthly_reports_remaining = monthly_reports_remaining + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [monthlyCredits, user.id]
    );

    // Record credit transaction
    const newBalance = user.monthly_reports_remaining + monthlyCredits;
    await db.query(
      `INSERT INTO credit_transactions (user_id, amount, transaction_type, balance_after, created_at)
       VALUES ($1, $2, 'subscription_credit', $3, NOW())`,
      [user.id, monthlyCredits, newBalance]
    );

    // Record payment
    await db.query(
      `INSERT INTO payments (user_id, stripe_subscription_id, amount_paid, currency, payment_type, status, created_at)
       VALUES ($1, $2, $3, 'gbp', 'subscription', 'succeeded', NOW())`,
      [user.id, invoice.subscription, invoice.amount_paid]
    );

    logger.info(`Monthly subscription payment: +${monthlyCredits} credits for user ${user.id}`);
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  
  const user = await db.queryOne<User>(
    'SELECT * FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  if (user) {
    await db.query(
      `UPDATE users SET subscription_status = 'past_due', updated_at = NOW() WHERE id = $1`,
      [user.id]
    );

    await sendEmail({
      to: user.email,
      template: 'lowCredits',
      data: {
        firstName: user.first_name || 'there',
        credits: user.monthly_reports_remaining.toString(),
        buyCreditsUrl: `${config.frontendUrl}/billing`,
        monthlyReports: '12',
      },
    });

    logger.warn(`Payment failed for user ${user.id}`);
  }
}

export default router;
