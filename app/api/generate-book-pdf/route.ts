import Stripe from 'stripe';
import type { NextRequest } from 'next/server';
import { getAdminDb } from '../../../lib/firebaseAdmin';
import { renderToBuffer } from '@react-pdf/renderer';
import { Resend } from 'resend';
import { createElement } from 'react';
import { MemoryBookDocument, type BookPage } from '../../../lib/memoryBookPdf';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { paymentIntentId } = await request.json();

    if (!paymentIntentId) {
      return Response.json({ error: 'Missing paymentIntentId' }, { status: 400 });
    }

    // Verify payment succeeded
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') {
      return Response.json({ error: 'Payment not completed' }, { status: 402 });
    }

    const { eventId, email, tributeName } = intent.metadata;

    if (!eventId || !email) {
      return Response.json({ error: 'Missing metadata' }, { status: 400 });
    }

    // Idempotency — check if we already processed this
    const db = getAdminDb();
    const bookOrderRef = db.collection('bookOrders').doc(paymentIntentId);
    const existing = await bookOrderRef.get();
    if (existing.exists) {
      return Response.json({ ok: true, alreadyProcessed: true });
    }

    // Fetch tribute data
    const tributeSnap = await db.collection('tributes').doc(eventId).get();
    const tribute = tributeSnap.data();
    if (!tribute) {
      return Response.json({ error: 'Tribute not found' }, { status: 404 });
    }

    // Check for user-configured book draft (from BookBuilderScreen)
    const draftSnap = await db
      .collection('tributes').doc(eventId)
      .collection('bookDraft').doc('current')
      .get();
    const draft = draftSnap.exists ? draftSnap.data() : null;

    let heroPhotoUrl: string | null;
    let backCoverPhotoUrl: string | null = null;
    let pages: BookPage[] | undefined;
    let photoUrls: string[] = []; // fallback only
    let theme = 'classic';
    let themePhotoUrl: string | null = null;

    if (draft) {
      heroPhotoUrl = draft.coverPhotoUrl ?? null;
      backCoverPhotoUrl = draft.backCoverPhotoUrl ?? null;
      theme = draft.theme ?? 'classic';
      themePhotoUrl = draft.themePhotoUrl ?? null;

      // Prefer the per-page structure saved by BookBuilderScreen
      if (Array.isArray(draft.pages) && draft.pages.length > 0) {
        pages = draft.pages as BookPage[];
        // Derive flat photoUrls for heroPhotoUrl fallback
        const allPagePhotos = pages.flatMap(p => p.photoUrls ?? []);
        if (!heroPhotoUrl) heroPhotoUrl = allPagePhotos[0] ?? null;
      } else {
        // Older draft format: flat photoUrls
        photoUrls = draft.photoUrls ?? [];
        if (!heroPhotoUrl) heroPhotoUrl = photoUrls[0] ?? null;
      }
    } else {
      // No draft — fall back to all gallery photos, 4-per-page
      const photosSnap = await db
        .collection('tributes').doc(eventId)
        .collection('photos')
        .orderBy('createdAt', 'asc')
        .limit(40)
        .get();
      photoUrls = photosSnap.docs.map(d => d.data().url as string).filter(Boolean);
      heroPhotoUrl = tribute.heroPhotoUrl || photoUrls[0] || null;
    }

    // Build PDF
    const pdfData = {
      name: tributeName || draft?.tributeName || tribute.deceasedName || 'In Loving Memory',
      birthYear: tribute.birthYear ?? '',
      deathYear: tribute.deathYear ?? '',
      heroPhotoUrl,
      backCoverPhotoUrl,
      theme,
      themePhotoUrl,
      pages,
      photoUrls,
      bookSize:    draft?.bookSize    ?? '8x11',
      orientation: draft?.orientation ?? 'portrait',
    };

    const pdfBuffer = await renderToBuffer(
      createElement(MemoryBookDocument, pdfData) as any
    );

    const orderRecord = {
      eventId,
      email,
      tributeName: pdfData.name,
      paymentIntentId,
      amountCents: intent.amount,
      currency: intent.currency,
      bookSize:    pdfData.bookSize,
      orientation: pdfData.orientation,
      coverType:   draft?.coverType ?? 'softcover',
      createdAt: new Date().toISOString(),
      status: 'delivered',
    };

    // Record the order (root collection for server lookups)
    await bookOrderRef.set(orderRecord);

    // Mirror to tribute subcollection so the app can read past orders
    await db
      .collection('tributes').doc(eventId)
      .collection('bookOrders').doc(paymentIntentId)
      .set(orderRecord);

    // Send email with PDF attached
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `Your Memory Book — ${pdfData.name}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #fafaf8;">
          <h1 style="color: #2c2c2c; font-size: 28px; margin-bottom: 8px;">Your Memory Book is ready 🕊️</h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Your memory book for <strong>${pdfData.name}</strong> is attached to this email as a PDF.
            You can print it at home or take it to any local print shop for a beautiful keepsake.
          </p>
          <hr style="border: none; border-top: 1px solid #e0ddd8; margin: 24px 0;" />
          <p style="color: #888; font-size: 13px;">
            Suggested print sizes: 8.5" × 11" (letter) or A4 · Full colour · Photo paper recommended
          </p>
          <p style="color: #888; font-size: 13px; margin-top: 16px;">
            With care,<br/>The Lumoriam Team
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `memory-book-${pdfData.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    return Response.json({ ok: true });
  } catch (err: any) {
    console.error('generate-book-pdf error:', err?.message ?? err);
    return Response.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
