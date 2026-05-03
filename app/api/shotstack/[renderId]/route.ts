import type { NextRequest } from 'next/server';
import { verifyFirebaseToken } from '../../../../lib/verifyToken';

export async function GET(request: NextRequest, ctx: RouteContext<'/api/shotstack/[renderId]'>) {
  const valid = await verifyFirebaseToken(request.headers.get('Authorization'));
  if (!valid) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { renderId } = await ctx.params;

  const response = await fetch(`https://api.shotstack.io/stage/render/${renderId}`, {
    headers: { 'x-api-key': process.env.SHOTSTACK_API_KEY! },
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
