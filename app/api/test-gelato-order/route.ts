import type { NextRequest } from 'next/server';
import { getAdminDb } from '../../../lib/firebaseAdmin';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { MemoryBookDocument, type BookPage } from '../../../lib/memoryBookPdf';

const GELATO_API_KEY = process.env.GELATO_API_KEY!;

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

// POST /api/test-gelato-order
// Body: { eventId, coverType?, bookSize?, orientation? }
// Creates a draftMode order — never goes to print, visible in Gelato dashboard.
export async function POST(request: NextRequest) {
  try {
    const {
      eventId,
      coverType = 'hardcover',
      bookSize = '8x11',
      orientation = 'portrait',
    } = await request.json();

    if (!eventId) {
      return Response.json({ error: 'Missing eventId' }, { status: 400 });
    }

    const uidKey = `${coverType}_${bookSize}_${orientation}`;
    const productUid = GELATO_PRODUCT_UIDS[uidKey];
    if (!productUid) {
      return Response.json({ error: `Unsupported config: ${uidKey}` }, { status: 400 });
    }

    const db = getAdminDb();

    const tributeSnap = await db.collection('tributes').doc(eventId).get();
    const tribute = tributeSnap.data();
    if (!tribute) {
      return Response.json({ error: 'Tribute not found' }, { status: 404 });
    }

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

    if (draft) {
      heroPhotoUrl = draft.coverPhotoUrl ?? null;
      backCoverPhotoUrl = draft.backCoverPhotoUrl ?? null;
      theme = draft.theme ?? 'classic';
      themePhotoUrl = draft.themePhotoUrl ?? null;

      if (Array.isArray(draft.pages) && draft.pages.length > 0) {
        pages = draft.pages as BookPage[];
        if (!heroPhotoUrl) heroPhotoUrl = pages.flatMap(p => p.photoUrls ?? [])[0] ?? null;
      } else {
        photoUrls = draft.photoUrls ?? [];
        if (!heroPhotoUrl) heroPhotoUrl = photoUrls[0] ?? null;
      }
    } else {
      const photosSnap = await db
        .collection('tributes').doc(eventId)
        .collection('photos')
        .orderBy('createdAt', 'asc')
        .limit(40)
        .get();
      photoUrls = photosSnap.docs.map(d => d.data().url as string).filter(Boolean);
      heroPhotoUrl = tribute.heroPhotoUrl || photoUrls[0] || null;
    }

    const name = draft?.tributeName || tribute.deceasedName || tribute.lovedOneName || 'In Loving Memory';

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

    console.log(`PDF generated: ${pdfBuffer.length} bytes`);
    const filename = `TEST-memory-book-${eventId}-${Date.now()}.pdf`;
    let fileUrl: string;
    try {
      fileUrl = await uploadPdfToGelato(pdfBuffer, filename);
      console.log(`PDF uploaded to Gelato: ${fileUrl}`);
    } catch (uploadErr: any) {
      console.error('UPLOAD FAILED:', uploadErr?.message);
      return Response.json({ error: `Upload failed: ${uploadErr?.message}` }, { status: 500 });
    }

    const pageCount = Math.max(30, Math.min(60, draft?.pageCount ?? 30));

    const gelatoOrder = {
      orderReferenceId: `TEST-${Date.now()}`,
      customerReferenceId: `TEST-${eventId}`,
      currency: 'CAD',
      draftMode: true,
      items: [
        {
          itemReferenceId: `TEST-${Date.now()}-book`,
          productUid,
          pageCount,
          files: [{ type: 'default', url: fileUrl }],
          quantity: 1,
        },
      ],
      shippingAddress: {
        firstName: 'Test',
        lastName: 'Order',
        addressLine1: '123 Test Street',
        addressLine2: '',
        city: 'Toronto',
        state: 'ON',
        postCode: 'M5V 3A8',
        country: 'CA',
        email: 'waseemelmais@gmail.com',
      },
    };

    console.log('Placing Gelato order...');
    let gelatoRes: Response;
    try {
      gelatoRes = await fetch('https://order.gelatoapis.com/v4/orders', {
        method: 'POST',
        headers: {
          'X-API-KEY': GELATO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gelatoOrder),
      });
    } catch (orderErr: any) {
      console.error('ORDER FETCH FAILED:', orderErr?.message);
      return Response.json({ error: `Order fetch failed: ${orderErr?.message}` }, { status: 500 });
    }

    const gelatoText = await gelatoRes.text();
    console.log(`Gelato order response: ${gelatoRes.status} ${gelatoText.slice(0, 200)}`);
    if (!gelatoRes.ok) {
      throw new Error(`Gelato order failed: ${gelatoRes.status} ${gelatoText}`);
    }

    const gelatoData = JSON.parse(gelatoText);

    return Response.json({
      ok: true,
      draftMode: true,
      gelatoOrderId: gelatoData.id,
      gelatoStatus: gelatoData.status,
      productUid,
      pageCount,
      pdfFilename: filename,
      message: 'Draft order created — check your Gelato dashboard to preview.',
    });
  } catch (err: any) {
    console.error('test-gelato-order error:', err?.message ?? err);
    return Response.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
