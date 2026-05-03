export interface TokenResult {
  valid: boolean;
  uid: string | null;
  idToken: string | null;
}

export async function verifyFirebaseToken(authHeader: string | null): Promise<TokenResult> {
  if (!authHeader?.startsWith('Bearer ')) return { valid: false, uid: null, idToken: null };
  const token = authHeader.slice(7);
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_WEB_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      }
    );
    if (!res.ok) return { valid: false, uid: null, idToken: null };
    const data = await res.json();
    const user = data.users?.[0];
    if (!user) return { valid: false, uid: null, idToken: null };
    return { valid: true, uid: user.localId, idToken: token };
  } catch {
    return { valid: false, uid: null, idToken: null };
  }
}
