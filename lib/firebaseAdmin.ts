import admin from 'firebase-admin';

function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.apps[0]!;
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export function getAdminDb(): admin.firestore.Firestore {
  getAdminApp();
  return admin.firestore();
}
