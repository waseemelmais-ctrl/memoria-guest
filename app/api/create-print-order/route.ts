import Stripe from 'stripe';
import type { NextRequest } from 'next/server';
import { getAdminDb } from '../../../lib/firebaseAdmin';
import { getBookPrice } from '../../../lib/bookPricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { eventId, email, tributeName, shippingAddress, coverType } = await request.json();

    if (!eventId || !email || !shippingAddress) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { firstName, lastName, addressLine1, city, province, postalCode } = shippingAddress;
    if (!firstName || !lastName || !addressLine1 || !city || !province || !postalCode) {
      return Response.json({ error: 'Incomplete shipping address' }, { status: 400 });
    }

    // Read book size from draft — never trust client-supplied price
    const db = getAdminDb();
    const draftSnap = await db
      .collection('tributes').doc(eventId)
      .collection('bookDraft').doc('current')
      .get();
    const draft = draftSnap.exists ? draftSnap.data() : null;
    const bookSize  = draft?.bookSize  ?? '8x11';
    const pageCount = draft?.pageCount ?? 30;

    const resolvedCoverType = coverType === 'hardcover' ? 'hardcover' : 'softcover';
    const amountCents = getBookPrice(resolvedCoverType, bookSize, pageCount);

    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      metadata: {
        eventId,
        email,
        tributeName: tributeName ?? '',
        productType: 'memory_book_print',
        coverType: resolvedCoverType,
        bookSize,
        shippingAddress: JSON.stringify(shippingAddress),
      },
    });

    return Response.json({ clientSecret: intent.client_secret, amountCents });
  } catch (err: any) {
    console.error('create-print-order error:', err?.message);
    return Response.json({ error: 'Failed to create payment intent' }, { status: 500 });
  }
}
