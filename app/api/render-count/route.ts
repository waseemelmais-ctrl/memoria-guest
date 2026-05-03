import type { NextRequest } from 'next/server';
import { verifyFirebaseToken } from '../../../lib/verifyToken';
import { getIntField } from '../../../lib/firestoreRest';

const FREE_RENDER_LIMIT = 5;

export async function GET(request: NextRequest) {
  const { valid, uid, idToken } = await verifyFirebaseToken(request.headers.get('Authorization'));
  if (!valid || !uid || !idToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const count = await getIntField(idToken, `users/${uid}/stats/renders`, 'count');
  return Response.json({ count, limit: FREE_RENDER_LIMIT, remaining: FREE_RENDER_LIMIT - count });
}
