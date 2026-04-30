import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAAvhy0A6fUtJ4k2ShTmUdExBs9FswMC3o",
  authDomain: "photo-slideshow-6bc3b.firebaseapp.com",
  projectId: "photo-slideshow-6bc3b",
  storageBucket: "photo-slideshow-6bc3b.firebasestorage.app",
  messagingSenderId: "113724412098",
  appId: "1:113724412098:web:a2375d04d44e23459feb5b"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);