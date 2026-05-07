import Stripe from 'stripe';
import type { NextRequest } from 'next/server';
import { getAdminDb } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { paymentIntentId, eventId, donorName, message, amountCents } = await request.json();

    if (!paymentIntentId || !eventId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify payment actually succeeded with Stripe
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') {
      return Response.json({ error: 'Payment not completed' }, { status: 400 });
    }
    if (intent.metadata.eventId !== eventId) {
      return Response.json({ error: 'Event mismatch' }, { status: 400 });
    }

    const db = getAdminDb();
    const donationRef = db.collection('donations').doc(paymentIntentId);

    // Idempotency — only record once
    const existing = await donationRef.get();
    if (existing.exists) {
      return Response.json({ ok: true, alreadyRecorded: true });
    }

    const batch = db.batch();

    // Record the donation
    batch.set(donationRef, {
      eventId,
      amountCents: intent.amount,
      donorName: donorName ?? intent.metadata.donorName ?? 'Anonymous',
      message: message ?? intent.metadata.message ?? '',
      currency: intent.currency,
      createdAt: new Date().toISOString(),
      status: 'succeeded',
    });

    // Increment tribute totals
    const tributeRef = db.collection('tributes').doc(eventId);
    batch.update(tributeRef, {
      totalRaisedCents: admin.firestore.FieldValue.increment(intent.amount),
      donationCount: admin.firestore.FieldValue.increment(1),
    });

    await batch.commit();

    return Response.json({ ok: true });
  } catch (err: any) {
    console.error('record-donation error:', err?.message ?? err);
    return Response.json({ error: 'Failed to record donation' }, { status: 500 });
  }
}
