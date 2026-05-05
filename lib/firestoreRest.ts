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

// Creates a document only if it does not already exist (atomic). Returns false if it already existed.
export async function createDocumentIfNotExists(
  idToken: string,
  docPath: string,
  data: Record<string, string | number>,
): Promise<boolean> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = typeof value === 'number'
      ? { integerValue: String(value) }
      : { stringValue: value };
  }
  const res = await fetch(`${FIRESTORE_BASE}/${docPath}?currentDocument.exists=false`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (res.status === 409) return false;
  if (!res.ok) throw new Error(`Firestore create failed: ${res.status}`);
  return true;
}

export async function incrementIntField(idToken: string, docPath: string, field: string, amount = 1): Promise<void> {
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
          fieldTransforms: [{ fieldPath: field, increment: { integerValue: String(amount) } }],
        },
      }],
    }),
  });
  if (!res.ok) throw new Error(`Firestore increment failed: ${res.status}`);
}
