// Stripe Checkout (test mode). Everything that talks to Stripe is in this file, so tests can
// replace it with a fake and the rest of the app does not depend on the SDK.
import Stripe from 'stripe';

// Stripe keeps a Checkout page open for at least 30 minutes; the hold is extended to match.
export const CHECKOUT_MINUTES = 30;

export function createPayments(config) {
  const stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;
  const needStripe = () => {
    if (!stripe) throw new Error('STRIPE_SECRET_KEY is not set');
    return stripe;
  };

  return {
    async createCheckout({ booking, lines, email, lang, expiresAt }) {
      const session = await needStripe().checkout.sessions.create({
        mode: 'payment',
        customer_email: email,
        client_reference_id: booking.id,
        metadata: { bookingId: booking.id },
        locale: lang === 'en' ? 'en' : 'tr',
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        line_items: lines.map((line) => ({
          quantity: line.quantity,
          price_data: { currency: 'try', unit_amount: line.unitCents, product_data: { name: line.name, description: line.description } },
        })),
        success_url: `${config.APP_ORIGIN}/bookings/${booking.id}?paid=1`,
        cancel_url: `${config.APP_ORIGIN}/showtimes/${booking.showtimeId}`,
      });
      return { id: session.id, url: session.url };
    },

    async getCheckout(id) {
      const session = await needStripe().checkout.sessions.retrieve(id);
      return { id: session.id, url: session.url, status: session.status };
    },

    // Closes an open Checkout page so it can no longer be paid. Already closed is fine.
    async expireCheckout(id) {
      try {
        await needStripe().checkout.sessions.expire(id);
      } catch (err) {
        if (err?.code !== 'resource_missing' && !/status/i.test(err?.message ?? '')) throw err;
      }
    },

    // The idempotency key makes a repeated call (a webhook delivered twice) refund only once.
    async refund(paymentIntentId, idempotencyKey) {
      await needStripe().refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey });
    },

    // Throws if the signature does not match: only Stripe can have sent this event.
    verifyEvent(rawBody, signature) {
      if (!config.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
      return Stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
    },
  };
}
