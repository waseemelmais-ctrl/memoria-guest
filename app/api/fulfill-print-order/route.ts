import Stripe from 'stripe';
import type { NextRequest } from 'next/server';
import { getAdminDb } from '../../../lib/firebaseAdmin';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { MemoryBookDocument, type BookPage } from '../../../lib/memoryBookPdf';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const GELATO_API_KEY = process.env.GELATO_API_KEY!;
const GELATO_ORDERS_URL = 'https://order.gelatoapis.com/v4/orders';

const GELATO_PRODUCT_UID =
  'photobooks-softcover_pf_210x280-mm-8x11-inch_pt_170-gsm-65lb-coated-silk_cl_4-4_ccl_4-4_bt_glued-left_ct_matt-lamination_prt_1-0_cpt_250-gsm-100-lb-cover-coated-silk_ver';

async function uploadPdfToGelato(pdfBuffer: Buffer, filename: string): Promise<string> {
  // Upload PDF to Gelato's file storage
  const uploadRes = await fetch('https://file.gelatoapis.com/v1/files', {
    method: 'POST',
    headers: {
      'X-API-KEY': GELATO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: filename,
      content: pdfBuffer.toString('base64'),
    }),
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Gelato file upload failed: ${uploadRes.status} ${text}`);
  }

  const data = await uploadRes.json();
  return data.url as string;
}

export async function POST(request: NextRequest) {
  try {
    const { paymentIntentId } = await request.json();

    if (!paymentIntentId) {
      return Response.json({ error: 'Missing paymentIntentId' }, { status: 400 });
    }

    // Verify payment
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') {
      return Response.json({ error: 'Payment not completed' }, { status: 402 });
    }

    const { eventId, email, tributeName, shippingAddress: shippingAddressRaw } = intent.metadata;
    const shippingAddress = JSON.parse(shippingAddressRaw);

    if (!eventId) {
      return Response.json({ error: 'Missing metadata' }, { status: 400 });
    }

    // Idempotency
    const db = getAdminDb();
    const orderRef = db.collection('printOrders').doc(paymentIntentId);
    const existing = await orderRef.get();
    if (existing.exists) {
      return Response.json({ ok: true, alreadyProcessed: true });
    }

    // Fetch tribute data
    const tributeSnap = await db.collection('tributes').doc(eventId).get();
    const tribute = tributeSnap.data();
    if (!tribute) {
      return Response.json({ error: 'Tribute not found' }, { status: 404 });
    }

    // Check for user-configured book draft
    const draftSnap = await db
      .collection('tributes').doc(eventId)
      .collection('bookDraft').doc('current')
      .get();
    const draft = draftSnap.exists ? draftSnap.data() : null;

    let heroPhotoUrl: string | null;
    let backCoverPhotoUrl: string | null = null;
    let pages: BookPage[] | undefined;
    let photoUrls: string[] = [];
    let theme = 'classic';
    let themePhotoUrl: string | null = null;

    if (draft) {
      heroPhotoUrl = draft.coverPhotoUrl ?? null;
      backCoverPhotoUrl = draft.backCoverPhotoUrl ?? null;
      theme = draft.theme ?? 'classic';
      themePhotoUrl = draft.themePhotoUrl ?? null;

      if (Array.isArray(draft.pages) && draft.pages.length > 0) {
        pages = draft.pages as BookPage[];
        const allPagePhotos = pages.flatMap(p => p.photoUrls ?? []);
        if (!heroPhotoUrl) heroPhotoUrl = allPagePhotos[0] ?? null;
      } else {
        photoUrls = draft.photoUrls ?? [];
        if (!heroPhotoUrl) heroPhotoUrl = photoUrls[0] ?? null;
      }
    } else {
      // Fallback: all gallery photos, 4-per-page
      const photosSnap = await db
        .collection('tributes').doc(eventId)
        .collection('photos')
        .orderBy('createdAt', 'asc')
        .limit(40)
        .get();
      photoUrls = photosSnap.docs.map(d => d.data().url as string).filter(Boolean);
      heroPhotoUrl = tribute.heroPhotoUrl || photoUrls[0] || null;
    }

    const name = tributeName || draft?.tributeName || tribute.deceasedName || 'In Loving Memory';

    // Generate PDF
    const pdfBuffer = await renderToBuffer(
      createElement(MemoryBookDocument, {
        name,
        birthYear: tribute.birthYear ?? '',
        deathYear: tribute.deathYear ?? '',
        heroPhotoUrl,
        backCoverPhotoUrl,
        theme,
        themePhotoUrl,
        pages,
        photoUrls,
      }) as any
    );

    // Calculate page count for Gelato (must be >= 30, even number)
    // Cover + blank signature + (photo page + lined page) × N + back cover
    const numPhotoPages = pages
      ? pages.length
      : Math.ceil(photoUrls.filter(u => u !== heroPhotoUrl).length / 4);
    const rawTotal = 2 + numPhotoPages * 2 + 1; // cover + blank + (photo+lined pairs) + back
    const totalPages = Math.max(30, Math.ceil(rawTotal / 2) * 2);

    // Upload PDF to Gelato
    const filename = `memory-book-${eventId}.pdf`;
    const fileUrl = await uploadPdfToGelato(pdfBuffer, filename);

    // Place Gelato order
    const gelatoOrder = {
      orderReferenceId: paymentIntentId,
      customerReferenceId: eventId,
      currency: 'CAD',
      items: [
        {
          itemReferenceId: `${paymentIntentId}-book`,
          productUid: GELATO_PRODUCT_UID,
          pageCount: totalPages,
          files: [{ type: 'default', url: fileUrl }],
          quantity: 1,
        },
      ],
      shippingAddress: {
        firstName: shippingAddress.firstName,
        lastName: shippingAddress.lastName,
        addressLine1: shippingAddress.addressLine1,
        addressLine2: shippingAddress.addressLine2 ?? '',
        city: shippingAddress.city,
        state: shippingAddress.province,
        postCode: shippingAddress.postalCode,
        country: shippingAddress.country ?? 'CA',
        email,
      },
    };

    const gelatoRes = await fetch(GELATO_ORDERS_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': GELATO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gelatoOrder),
    });

    if (!gelatoRes.ok) {
      const text = await gelatoRes.text();
      throw new Error(`Gelato order failed: ${gelatoRes.status} ${text}`);
    }

    const gelatoData = await gelatoRes.json();

    // Record order in Firestore
    await orderRef.set({
      eventId,
      email,
      tributeName: name,
      paymentIntentId,
      amountCents: intent.amount,
      currency: intent.currency,
      shippingAddress,
      gelatoOrderId: gelatoData.id,
      gelatoStatus: gelatoData.status,
      pageCount: totalPages,
      createdAt: new Date().toISOString(),
      type: 'print',
    });

    console.log(`Print order placed: ${gelatoData.id} for tribute ${eventId}`);
    return Response.json({ ok: true, gelatoOrderId: gelatoData.id });
  } catch (err: any) {
    console.error('fulfill-print-order error:', err?.message ?? err);
    return Response.json({ error: 'Failed to fulfill print order' }, { status: 500 });
  }
}
