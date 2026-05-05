import type { NextRequest } from 'next/server';
import { verifyFirebaseToken } from '../../../lib/verifyToken';
import { getIntField } from '../../../lib/firestoreRest';

const FREE_RENDER_LIMIT = 1;
const PRO_RENDER_LIMIT = 20;
const DEV_UIDS = ['N2z6twZfGfaiOXP0DAxkKLGkBr12'];

export async function GET(request: NextRequest) {
  const { valid, uid, idToken } = await verifyFirebaseToken(request.headers.get('Authorization'));
  if (!valid || !uid || !idToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEV_UIDS.includes(uid)) {
    return Response.json({ count: 0, limit: 999, remaining: 999 });
  }

  const isPro = request.nextUrl.searchParams.get('isPro') === 'true';
  const limit = isPro ? PRO_RENDER_LIMIT : FREE_RENDER_LIMIT;
  const count = await getIntField(idToken, `users/${uid}/stats/renders`, 'count');
  return Response.json({ count, limit, remaining: limit - count });
}
