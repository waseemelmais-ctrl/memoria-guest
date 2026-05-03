import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { verifyFirebaseToken } from '../../../lib/verifyToken';

export async function GET(request: NextRequest) {
  const valid = await verifyFirebaseToken(request.headers.get('Authorization'));
  if (!valid) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const timestamp = Math.round(Date.now() / 1000);
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET!;
  const toSign = `timestamp=${timestamp}&upload_preset=${uploadPreset}`;
  const signature = crypto
    .createHash('sha1')
    .update(toSign + process.env.CLOUDINARY_API_SECRET!)
    .digest('hex');

  return Response.json({
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    uploadPreset,
  });
}
