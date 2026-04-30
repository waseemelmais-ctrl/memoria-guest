import type { NextRequest } from 'next/server';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/shotstack/[renderId]'>) {
  const { renderId } = await ctx.params;

  const response = await fetch(`https://api.shotstack.io/stage/render/${renderId}`, {
    headers: {
      'x-api-key': process.env.SHOTSTACK_API_KEY!,
    },
  });

  const data = await response.json();
  return Response.json(data, { status: response.status });
}
