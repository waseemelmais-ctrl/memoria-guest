const PROJECT_ID = process.env.FIREBASE_PROJECT_ID!;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export async function getIntField(idToken: string, docPath: string, field: string): Promise<number> {
  const res = await fetch(`${FIRESTORE_BASE}/${docPath}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return 0;
  if (!res.ok) throw new Error(`Firestore read failed: ${res.status}`);
  const data = await res.json();
  const val = data.fields?.[field];
  if (!val) return 0;
  return parseInt(val.integerValue ?? val.doubleValue ?? '0', 10);
}

export async function incrementIntField(idToken: string, docPath: string, field: string): Promise<void> {
  const res = await fetch(`${FIRESTORE_BASE}:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      writes: [{
        transform: {
          document: `projects/${PROJECT_ID}/databases/(default)/documents/${docPath}`,
          fieldTransforms: [{ fieldPath: field, increment: { integerValue: '1' } }],
        },
      }],
    }),
  });
  if (!res.ok) throw new Error(`Firestore increment failed: ${res.status}`);
}
