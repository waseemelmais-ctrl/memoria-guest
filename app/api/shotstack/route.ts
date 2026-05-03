import type { NextRequest } from 'next/server';
import { verifyFirebaseToken } from '../../../lib/verifyToken';

export async function POST(request: NextRequest) {
  const valid = await verifyFirebaseToken(request.headers.get('Authorization'));
  if (!valid) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = await request.json();

  const response = await fetch('https://api.shotstack.io/stage/render', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.SHOTSTACK_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
