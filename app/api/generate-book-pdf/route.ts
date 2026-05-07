import Stripe from 'stripe';
import type { NextRequest } from 'next/server';
import { getAdminDb } from '../../../lib/firebaseAdmin';
import { renderToBuffer } from '@react-pdf/renderer';
import { Resend } from 'resend';
import { createElement } from 'react';
import { MemoryBookDocument } from '../../../lib/memoryBookPdf';

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

    let photoUrls: string[];
    let heroPhotoUrl: string | null;
    let condolenceMessages: { name: string; message: string }[] = [];

    if (draft) {
      // Use user's curated selection
      photoUrls = draft.photoUrls ?? [];
      heroPhotoUrl = draft.coverPhotoUrl ?? photoUrls[0] ?? null;
      condolenceMessages = draft.condolenceMessages ?? [];
    } else {
      // Fallback: use all gallery photos
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
      photoUrls,
      condolenceMessages,
      photosPerPage: (draft?.photosPerPage ?? 4) as 1 | 2 | 4,
    };

    const pdfBuffer = await renderToBuffer(
      createElement(MemoryBookDocument, pdfData) as any
    );

    // Record the order
    await bookOrderRef.set({
      eventId,
      email,
      tributeName: pdfData.name,
      paymentIntentId,
      amountCents: intent.amount,
      currency: intent.currency,
      createdAt: new Date().toISOString(),
      status: 'delivered',
    });

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
            With care,<br/>The Memoriam Team
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
