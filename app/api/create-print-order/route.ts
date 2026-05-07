import Stripe from 'stripe';
import type { NextRequest } from 'next/server';
import { getAdminDb } from '../../../lib/firebaseAdmin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRINT_PRICE_CENTS = 3599; // $35.99 CAD

const GELATO_PRODUCT_UID =
  'photobooks-softcover_pf_210x280-mm-8x11-inch_pt_170-gsm-65lb-coated-silk_cl_4-4_ccl_4-4_bt_glued-left_ct_matt-lamination_prt_1-0_cpt_250-gsm-100-lb-cover-coated-silk_ver';

export async function POST(request: NextRequest) {
  try {
    const { eventId, email, tributeName, shippingAddress } = await request.json();

    // Validate required fields
    if (!eventId || !email || !shippingAddress) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { firstName, lastName, addressLine1, city, province, postalCode, country } = shippingAddress;
    if (!firstName || !lastName || !addressLine1 || !city || !province || !postalCode) {
      return Response.json({ error: 'Incomplete shipping address' }, { status: 400 });
    }

    // Create Stripe PaymentIntent
    const intent = await stripe.paymentIntents.create({
      amount: PRINT_PRICE_CENTS,
      currency: 'cad',
      metadata: {
        eventId,
        email,
        tributeName: tributeName ?? '',
        productType: 'memory_book_print',
        shippingAddress: JSON.stringify(shippingAddress),
      },
    });

    return Response.json({ clientSecret: intent.client_secret });
  } catch (err: any) {
    console.error('create-print-order error:', err?.message);
    return Response.json({ error: 'Failed to create payment intent' }, { status: 500 });
  }
}
