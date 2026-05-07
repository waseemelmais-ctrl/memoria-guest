import Stripe from 'stripe';
import type { NextRequest } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRICES = {
  pdf: 599, // $5.99 CAD in cents
};

export async function POST(request: NextRequest) {
  try {
    const { eventId, email, tributeName } = await request.json();

    if (!eventId || !email) {
      return Response.json({ error: 'Missing eventId or email' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Response.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const intent = await stripe.paymentIntents.create({
      amount: PRICES.pdf,
      currency: 'cad',
      metadata: {
        eventId,
        email,
        tributeName: tributeName ?? '',
        productType: 'memory_book_pdf',
      },
    });

    return Response.json({ clientSecret: intent.client_secret });
  } catch (err: any) {
    console.error('create-book-payment-intent error:', err?.message);
    return Response.json({ error: 'Failed to create payment intent' }, { status: 500 });
  }
}
