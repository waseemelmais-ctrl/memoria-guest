import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
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
