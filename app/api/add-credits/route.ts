import type { NextRequest } from 'next/server';
import { verifyFirebaseToken } from '../../../lib/verifyToken';
import { incrementIntField, createDocumentIfNotExists } from '../../../lib/firestoreRest';

const RENDER_DOC = (uid: string) => `users/${uid}/stats/renders`;
const GRANT_DOC = (uid: string, txId: string) => `users/${uid}/grantedTransactions/${txId}`;

const PRODUCT_CREDITS: Record<string, number> = {
  memoriam_credits_5: 5,
  memoriam_credits_10: 10,
  memoriam_credits_20: 20,
};

async function verifyRevenueCatPurchase(appUserId: string, productId: string, transactionId: string): Promise<boolean> {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${process.env.REVENUECAT_SECRET_KEY}` },
  });
  if (!res.ok) return false;
  const data = await res.json();
  const purchases: Array<{ id: string }> = data.subscriber?.non_subscriptions?.[productId] ?? [];
  return purchases.some(p => p.id === transactionId);
}

export async function POST(request: NextRequest) {
  const { valid, uid, idToken } = await verifyFirebaseToken(request.headers.get('Authorization'));
  if (!valid || !uid || !idToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { productId, transactionId } = body;

  if (!productId || !transactionId) {
    return Response.json({ error: 'Missing productId or transactionId' }, { status: 400 });
  }

  const credits = PRODUCT_CREDITS[productId];
  if (!credits) {
    return Response.json({ error: 'Invalid product' }, { status: 400 });
  }

  // Verify the purchase exists in RevenueCat before granting anything
  const verified = await verifyRevenueCatPurchase(uid, productId, transactionId);
  if (!verified) {
    return Response.json({ error: 'Purchase could not be verified' }, { status: 403 });
  }

  // Atomic idempotency — create the grant record only if it doesn't exist yet
  const granted = await createDocumentIfNotExists(idToken, GRANT_DOC(uid, transactionId), {
    productId,
    credits,
    grantedAt: new Date().toISOString(),
  });

  if (!granted) {
    // Already processed this transaction — safe to return success (restore purchases flow)
    return Response.json({ ok: true, added: 0, alreadyGranted: true });
  }

  await incrementIntField(idToken, RENDER_DOC(uid), 'bonusCredits', credits);
  return Response.json({ ok: true, added: credits });
}
