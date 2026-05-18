import Stripe from 'stripe';
import type { NextRequest } from 'next/server';
import { getAdminDb } from '../../../lib/firebaseAdmin';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { MemoryBookDocument, type BookPage } from '../../../lib/memoryBookPdf';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const GELATO_API_KEY = process.env.GELATO_API_KEY!;
const GELATO_ORDERS_URL = 'https://order.gelatoapis.com/v4/orders';

// Gelato naming convention: photobooks-{cover}_pf_{W}x{H}-mm-{w}x{h}-inch_{interior}_{cover-paper}_{ver|hor}
// Confirmed from Gelato dashboard May 2026.
// Key difference: hardcover uses cpt_130-gsm-65-lb-cover-coated-silk (not 250-gsm like softcover).
// Landscape (horizontal) is only available for 8×11 — square sizes are portrait-only.

// UIDs confirmed directly from Gelato dashboard, May 2026.
// Softcover: vertical only, 8×8" and 8×11" only.
// Hardcover: all three sizes vertical + 8×11" horizontal only.
const SC_BASE = 'pt_170-gsm-65lb-coated-silk_cl_4-4_ccl_4-4_bt_glued-left_ct_matt-lamination_prt_1-0_cpt_250-gsm-100-lb-cover-coated-silk';
const HC_BASE = 'pt_170-gsm-65lb-coated-silk_cl_4-4_ccl_4-4_bt_glued-left_ct_matt-lamination_prt_1-0_cpt_130-gsm-65-lb-cover-coated-silk';

const GELATO_PRODUCT_UIDS: Record<string, string> = {
  'softcover_5.5x5.5_portrait': `photobooks-softcover_pf_140x140-mm-5.5x5.5-inch_${SC_BASE}_ver`,
  'softcover_8x8_portrait':     `photobooks-softcover_pf_200x200-mm-8x8-inch_${SC_BASE}_ver`,
  'softcover_8x11_portrait':    `photobooks-softcover_pf_210x280-mm-8x11-inch_${SC_BASE}_ver`,
  'hardcover_8x8_portrait':    `photobooks-hardcover_pf_200x200-mm-8x8-inch_${HC_BASE}_ver`,
  'hardcover_8x11_portrait':   `photobooks-hardcover_pf_210x280-mm-8x11-inch_${HC_BASE}_ver`,
  'hardcover_8x11_landscape':  `photobooks-hardcover_pf_210x280-mm-8x11-inch_${HC_BASE}_hor`,
  'hardcover_11x11_portrait':  `photobooks-hardcover_pf_280x280-mm-11x11-inch_${HC_BASE}_ver`,
};

async function uploadPdfToGelato(pdfBuffer: Buffer, filename: string): Promise<string> {
  const formData = new FormData();
  const arrayBuffer = pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength) as ArrayBuffer;
  formData.append('file', new Blob([arrayBuffer], { type: 'application/pdf' }), filename);

  const uploadRes = await fetch('https://file.gelatoapis.com/v1/files', {
    method: 'POST',
    headers: { 'X-API-KEY': GELATO_API_KEY },
    body: formData,
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

    const { eventId, email, tributeName, shippingAddress: shippingAddressRaw, coverType: metaCoverType } = intent.metadata;
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

    // Resolve product UID from user's size + orientation + cover type selection
    const bookSize    = draft?.bookSize    ?? '8x11';
    const orientation = draft?.orientation ?? 'portrait';
    // coverType comes from payment metadata (set at checkout), fallback to draft
    const coverType   = metaCoverType ?? draft?.coverType ?? 'softcover';
    const uidKey      = `${coverType}_${bookSize}_${orientation}`;
    const productUid  = GELATO_PRODUCT_UIDS[uidKey];
    if (!productUid) {
      return Response.json({ error: `Unsupported product configuration: ${uidKey}` }, { status: 400 });
    }

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

    // Use the page count the user selected (saved in draft), clamped to valid range
    const totalPages = Math.max(30, Math.min(60, draft?.pageCount ?? 30));

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
          productUid,
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
      productUid,
      bookSize,
      orientation,
      coverType,
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
