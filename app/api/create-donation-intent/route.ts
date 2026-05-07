import Stripe from 'stripe';
import type { NextRequest } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { eventId, amountCents, donorName, message } = await request.json();

    if (!eventId || typeof eventId !== 'string') {
      return Response.json({ error: 'Missing eventId' }, { status: 400 });
    }
    if (!amountCents || typeof amountCents !== 'number' || amountCents < 500) {
      return Response.json({ error: 'Minimum donation is $5' }, { status: 400 });
    }
    if (amountCents > 1_000_000) {
      return Response.json({ error: 'Donation too large' }, { status: 400 });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'cad',
      automatic_payment_methods: { enabled: true },
      metadata: {
        eventId,
        donorName: (donorName ?? 'Anonymous').slice(0, 100),
        message: (message ?? '').slice(0, 500),
      },
    });

    return Response.json({ clientSecret: paymentIntent.client_secret });
  } catch (err: any) {
    console.error('create-donation-intent error:', err?.message ?? err);
    return Response.json({ error: 'Failed to create payment intent' }, { status: 500 });
  }
}
