import type { NextRequest } from 'next/server';
import { verifyFirebaseToken } from '../../../../lib/verifyToken';

export async function GET(request: NextRequest, ctx: RouteContext<'/api/shotstack/[renderId]'>) {
  const { valid } = await verifyFirebaseToken(request.headers.get('Authorization'));
  if (!valid) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { renderId } = await ctx.params;
  const isTest = request.nextUrl.searchParams.get('isTest') === 'true';

  const endpoint = isTest
    ? `https://api.shotstack.io/stage/render/${renderId}`
    : `https://api.shotstack.io/v1/render/${renderId}`;

  const apiKey = isTest
    ? process.env.SHOTSTACK_TEST_API_KEY!
    : process.env.SHOTSTACK_PRODUCTION_API_KEY!;

  const response = await fetch(endpoint, {
    headers: { 'x-api-key': apiKey },
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
