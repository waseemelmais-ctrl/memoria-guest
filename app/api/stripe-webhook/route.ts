import Stripe from 'stripe';
import type { NextRequest } from 'next/server';
import { getAdminDb } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) return Response.json({ error: 'No signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('Webhook signature failed:', err?.message);
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const { eventId, donorName, message } = intent.metadata;

    if (!eventId) {
      console.warn('Webhook: no eventId in metadata, skipping');
      return Response.json({ ok: true });
    }

    try {
      const db = getAdminDb();
      const donationRef = db.collection('donations').doc(intent.id);

      const existing = await donationRef.get();
      if (existing.exists) {
        return Response.json({ ok: true, alreadyRecorded: true });
      }

      const batch = db.batch();

      batch.set(donationRef, {
        eventId,
        amountCents: intent.amount,
        donorName: donorName ?? 'Anonymous',
        message: message ?? '',
        currency: intent.currency,
        createdAt: new Date().toISOString(),
        status: 'succeeded',
      });

      const tributeRef = db.collection('tributes').doc(eventId);
      batch.update(tributeRef, {
        totalRaisedCents: admin.firestore.FieldValue.increment(intent.amount),
        donationCount: admin.firestore.FieldValue.increment(1),
      });

      await batch.commit();
      console.log(`Donation recorded: ${intent.id} for tribute ${eventId}`);
    } catch (err: any) {
      console.error('Webhook Firestore write failed:', err?.message ?? err);
      return Response.json({ error: 'Firestore write failed' }, { status: 500 });
    }
  }

  return Response.json({ ok: true });
}
