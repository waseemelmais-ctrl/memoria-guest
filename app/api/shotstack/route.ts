import type { NextRequest } from 'next/server';
import { verifyFirebaseToken } from '../../../lib/verifyToken';
import { getIntField, incrementIntField } from '../../../lib/firestoreRest';

const FREE_RENDER_LIMIT = 1;
const PRO_RENDER_LIMIT = 20;
const RENDER_DOC = (uid: string) => `users/${uid}/stats/renders`;
const DEV_UIDS = ['N2z6twZfGfaiOXP0DAxkKLGkBr12'];

const SHOTSTACK_STAGE      = 'https://api.shotstack.io/stage/render';
const SHOTSTACK_PRODUCTION = 'https://api.shotstack.io/v1/render';

export async function POST(request: NextRequest) {
  const { valid, uid, idToken } = await verifyFirebaseToken(request.headers.get('Authorization'));
  if (!valid || !uid || !idToken) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const isDev  = DEV_UIDS.includes(uid);
  const body   = await request.json();
  const isPro  = body.isPro === true;
  const isTest = body.isTest === true;
  const limit  = isPro ? PRO_RENDER_LIMIT : FREE_RENDER_LIMIT;

  // Only check and increment render count for final (non-test) renders
  if (!isTest && !isDev) {
    const renderCount = await getIntField(idToken, RENDER_DOC(uid), 'count');
    if (renderCount >= limit) {
      return Response.json(
        { error: 'Render limit reached', count: renderCount, limit },
        { status: 429 }
      );
    }
  }

  const payload  = body.payload;
  const endpoint = isTest ? SHOTSTACK_STAGE : SHOTSTACK_PRODUCTION;
  const apiKey   = isTest
    ? process.env.SHOTSTACK_TEST_API_KEY!
    : process.env.SHOTSTACK_PRODUCTION_API_KEY!;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  // Only increment count on successful final renders (never for dev accounts)
  if (!isTest && !isDev && response.ok && data.response?.id) {
    await incrementIntField(idToken, RENDER_DOC(uid), 'count');
  }

  return Response.json(data, { status: response.status });
}
