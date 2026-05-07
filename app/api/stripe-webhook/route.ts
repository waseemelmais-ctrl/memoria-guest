import Stripe from 'stripe';
import type { NextRequest } from 'next/server';
import { getAdminDb } from '../../../lib/firebaseAdmin';
import admin from 'firebase-admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function grantRevenueCatPro(appUserId: string): Promise<boolean> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}/entitlements/Pro/promotional`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.REVENUECAT_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ duration: 'lifetime' }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    console.error('RevenueCat Pro grant failed:', res.status, text);
    return false;
  }
  return true;
}

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

      // Idempotency — only record once
      const existing = await donationRef.get();
      if (existing.exists) {
        return Response.json({ ok: true, alreadyRecorded: true });
      }

      // Record donation + increment tribute totals
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

      // ── Auto-grant Pro if conditions met ──────────────────────────────────
      const tributeSnap = await tributeRef.get();
      const tributeData = tributeSnap.data();

      if (
        tributeData?.proFromDonations === true &&
        tributeData?.proGranted !== true &&
        (tributeData?.totalRaisedCents ?? 0) + intent.amount >= 1499
      ) {
        const adminUid = tributeData.adminUserId;
        if (adminUid) {
          // Get payout details from private user doc to find the admin uid
          const userTributeRef = db
            .collection('users')
            .doc(adminUid)
            .collection('tributes')
            .doc(eventId);

          const granted = await grantRevenueCatPro(adminUid);

          if (granted) {
            // Mark as granted on both docs to prevent double-granting
            await Promise.all([
              tributeRef.update({ proGranted: true }),
              userTributeRef.update({ proGranted: true }),
            ]);
            console.log(`Pro granted to ${adminUid} for tribute ${eventId}`);
          }
        }
      }

    } catch (err: any) {
      console.error('Webhook error:', err?.message ?? err);
      return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
  }

  return Response.json({ ok: true });
}
