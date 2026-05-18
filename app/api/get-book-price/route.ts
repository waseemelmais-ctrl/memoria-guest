import type { NextRequest } from 'next/server';
import { getAdminDb } from '../../../lib/firebaseAdmin';
import { getBookPrice, isSoftcoverAvailable, PAGE_INCREMENT_CAD } from '../../../lib/bookPricing';

export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get('eventId');
    if (!eventId) {
      return Response.json({ error: 'Missing eventId' }, { status: 400 });
    }

    const db = getAdminDb();
    const draftSnap = await db
      .collection('tributes').doc(eventId)
      .collection('bookDraft').doc('current')
      .get();
    const draft = draftSnap.exists ? draftSnap.data() : null;

    const bookSize    = draft?.bookSize    ?? '8x11';
    const orientation = draft?.orientation ?? 'portrait';
    const pageCount   = draft?.pageCount   ?? 30;

    const softcoverAvailable = isSoftcoverAvailable(bookSize, orientation);

    // Per-2-page customer cost in USD cents: (CAD_increment / 1.20) × 1.70
    const scIncrement = softcoverAvailable
      ? Math.round((PAGE_INCREMENT_CAD.softcover[bookSize] ?? 0) / 1.20 * 1.70)
      : null;
    const hcIncrement = Math.round((PAGE_INCREMENT_CAD.hardcover[bookSize] ?? PAGE_INCREMENT_CAD.hardcover['8x11']) / 1.20 * 1.70);

    return Response.json({
      softcover:           softcoverAvailable ? getBookPrice('softcover', bookSize, pageCount) : null,
      hardcover:           getBookPrice('hardcover', bookSize, pageCount),
      softcoverAvailable,
      softcoverIncrement:  scIncrement,
      hardcoverIncrement:  hcIncrement,
      pageCount,
      bookSize,
      orientation,
      currency: 'USD',
    });
  } catch (err: any) {
    console.error('get-book-price error:', err?.message);
    return Response.json({ error: 'Failed to fetch pricing' }, { status: 500 });
  }
}
