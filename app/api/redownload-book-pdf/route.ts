import type { NextRequest } from 'next/server';
import { getAdminDb } from '../../../lib/firebaseAdmin';
import { renderToBuffer } from '@react-pdf/renderer';
import { Resend } from 'resend';
import { createElement } from 'react';
import { MemoryBookDocument, type BookPage } from '../../../lib/memoryBookPdf';

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { paymentIntentId } = await request.json();

    if (!paymentIntentId) {
      return Response.json({ error: 'Missing paymentIntentId' }, { status: 400 });
    }

    const db = getAdminDb();

    // Look up the original order
    const orderSnap = await db.collection('bookOrders').doc(paymentIntentId).get();
    if (!orderSnap.exists) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }
    const order = orderSnap.data()!;
    const { eventId, email } = order;

    // Fetch tribute data
    const tributeSnap = await db.collection('tributes').doc(eventId).get();
    const tribute = tributeSnap.data();
    if (!tribute) {
      return Response.json({ error: 'Tribute not found' }, { status: 404 });
    }

    // Read the current (possibly updated) draft
    const draftSnap = await db
      .collection('tributes').doc(eventId)
      .collection('bookDraft').doc('current')
      .get();
    const draft = draftSnap.exists ? draftSnap.data() : null;

    let heroPhotoUrl: string | null = null;
    let backCoverPhotoUrl: string | null = null;
    let pages: BookPage[] | undefined;
    let photoUrls: string[] = [];
    let theme = 'classic';
    let themePhotoUrl: string | null = null;
    let bookSize = order.bookSize ?? '8x11';
    let orientation = order.orientation ?? 'portrait';

    if (draft) {
      heroPhotoUrl     = draft.coverPhotoUrl ?? null;
      backCoverPhotoUrl = draft.backCoverPhotoUrl ?? null;
      theme            = draft.theme ?? 'classic';
      themePhotoUrl    = draft.themePhotoUrl ?? null;
      // Use draft size/orientation if the user edited them, else fall back to original order
      bookSize         = draft.bookSize    ?? bookSize;
      orientation      = draft.orientation ?? orientation;

      if (Array.isArray(draft.pages) && draft.pages.length > 0) {
        pages = draft.pages as BookPage[];
        if (!heroPhotoUrl) heroPhotoUrl = pages.flatMap(p => p.photoUrls ?? [])[0] ?? null;
      } else {
        photoUrls = draft.photoUrls ?? [];
        if (!heroPhotoUrl) heroPhotoUrl = photoUrls[0] ?? null;
      }
    }

    const tributeName = draft?.tributeName || tribute.deceasedName || 'In Loving Memory';

    const pdfBuffer = await renderToBuffer(
      createElement(MemoryBookDocument, {
        name:             tributeName,
        birthYear:        tribute.birthYear ?? '',
        deathYear:        tribute.deathYear ?? '',
        heroPhotoUrl,
        backCoverPhotoUrl,
        theme,
        themePhotoUrl,
        pages,
        photoUrls,
        bookSize,
        orientation,
      }) as any
    );

    // Update the subcollection record with the new size (in case they changed it)
    await db
      .collection('tributes').doc(eventId)
      .collection('bookOrders').doc(paymentIntentId)
      .set({ bookSize, orientation, lastDownloadedAt: new Date().toISOString() }, { merge: true });

    const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `Your Memory Book (updated) — ${tributeName}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #fafaf8;">
          <h1 style="color: #2c2c2c; font-size: 28px; margin-bottom: 8px;">Your updated Memory Book is ready 🕊️</h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Your updated memory book for <strong>${tributeName}</strong> is attached as a PDF.
            Print it at home or take it to any local print shop for a beautiful keepsake.
          </p>
          <hr style="border: none; border-top: 1px solid #e0ddd8; margin: 24px 0;" />
          <p style="color: #888; font-size: 13px;">
            Suggested print size: ${bookSize.replace('x', '" × ')}" · Full colour · Photo paper recommended
          </p>
          <p style="color: #888; font-size: 13px; margin-top: 16px;">
            With care,<br/>The Lumoriam Team
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `memory-book-${tributeName.replace(/\s+/g, '-').toLowerCase()}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    return Response.json({ ok: true });
  } catch (err: any) {
    console.error('redownload-book-pdf error:', err?.message ?? err);
    return Response.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
