import type { NextRequest } from 'next/server';
import { verifyFirebaseToken } from '../../../lib/verifyToken';
import { getIntField } from '../../../lib/firestoreRest';

const FREE_RENDER_LIMIT = 3;
const PRO_RENDER_LIMIT = 20;

export async function GET(request: NextRequest) {
  const { valid, uid, idToken } = await verifyFirebaseToken(request.headers.get('Authorization'));
  if (!valid || !uid || !idToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const isPro = request.nextUrl.searchParams.get('isPro') === 'true';
  const limit = isPro ? PRO_RENDER_LIMIT : FREE_RENDER_LIMIT;
  const count = await getIntField(idToken, `users/${uid}/stats/renders`, 'count');
  return Response.json({ count, limit, remaining: limit - count });
}
