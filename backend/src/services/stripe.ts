import Stripe from 'stripe';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
  typescript: true,
});

// Create or get Stripe customer
export async function getOrCreateCustomer(
  email: string,
  name?: string,
  existingCustomerId?: string
): Promise<Stripe.Customer> {
  if (existingCustomerId) {
    try {
      return await stripe.customers.retrieve(existingCustomerId) as Stripe.Customer;
    } catch {
      // Customer not found, create new
    }
  }

  const customer = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: {
      source: 'geosaas',
    },
  });

  logger.info(`Created Stripe customer: ${customer.id}`);
  return customer;
}

// Create checkout session for one-time payment
export async function createCheckoutSession(params: {
  customerId: string;
  email: string;
  credits: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const { customerId, email, credits, successUrl, cancelUrl } = params;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price: config.stripe.priceIndividual,
        quantity: credits,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: email,
    metadata: {
      credits: credits.toString(),
      type: 'one_time',
    },
  });

  logger.info(`Created checkout session: ${session.id}`);
  return session;
}

// Create subscription checkout session
export async function createSubscriptionSession(params: {
  customerId: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const { customerId, email, successUrl, cancelUrl } = params;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: config.stripe.priceSubscription,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: email,
    subscription_data: {
      metadata: {
        source: 'geosaas',
      },
    },
    metadata: {
      type: 'subscription',
    },
  });

  logger.info(`Created subscription session: ${session.id}`);
  return session;
}

// Cancel subscription
export async function cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.cancel(subscriptionId);
  logger.info(`Cancelled subscription: ${subscriptionId}`);
  return subscription;
}

// Get subscription details
export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(subscriptionId);
}

// Handle webhook events
export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      logger.info(`Checkout completed: ${session.id}`);
      // Handle payment completion - add credits
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      logger.info(`Subscription ${event.type}: ${subscription.id}`);
      // Handle subscription changes
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      logger.info(`Subscription cancelled: ${subscription.id}`);
      // Handle subscription cancellation
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      logger.info(`Invoice paid: ${invoice.id}`);
      // Handle successful subscription payment
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      logger.warn(`Invoice payment failed: ${invoice.id}`);
      // Handle failed payment
      break;
    }

    default:
      logger.info(`Unhandled webhook event: ${event.type}`);
  }
}

// Verify webhook signature
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    config.stripe.webhookSecret
  );
}

// Create Stripe portal session
export async function createPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  const { customerId, returnUrl } = params;

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  logger.info(`Created portal session: ${session.id}`);
  return session;
}
