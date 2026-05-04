import type { NextRequest } from 'next/server';
import { verifyFirebaseToken } from '../../../lib/verifyToken';
import { getIntField, incrementIntField } from '../../../lib/firestoreRest';

const FREE_RENDER_LIMIT = 3;
const PRO_RENDER_LIMIT = 20;
const RENDER_DOC = (uid: string) => `users/${uid}/stats/renders`;

export async function POST(request: NextRequest) {
  const { valid, uid, idToken } = await verifyFirebaseToken(request.headers.get('Authorization'));
  if (!valid || !uid || !idToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const renderCount = await getIntField(idToken, RENDER_DOC(uid), 'count');
  const body = await request.json();
  const isPro = body.isPro === true;
  const limit = isPro ? PRO_RENDER_LIMIT : FREE_RENDER_LIMIT;

  if (renderCount >= limit) {
    return Response.json(
      { error: 'Render limit reached', count: renderCount, limit },
      { status: 429 }
    );
  }

  const payload = body.payload;

  const response = await fetch('https://api.shotstack.io/stage/render', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.SHOTSTACK_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (response.ok && data.response?.id) {
    await incrementIntField(idToken, RENDER_DOC(uid), 'count');
  }

  return Response.json(data, { status: response.status });
}
