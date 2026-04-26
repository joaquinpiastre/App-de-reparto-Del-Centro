import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

import { primaryFirebaseDatabaseUrl } from '@/constants/firebaseRuntime';

const firebaseConfig = {
  apiKey: 'TU_API_KEY',
  authDomain: 'delcentro-reparto.firebaseapp.com',
  databaseURL: primaryFirebaseDatabaseUrl(),
  projectId: 'delcentro-reparto',
  storageBucket: 'delcentro-reparto.appspot.com',
  messagingSenderId: 'TU_SENDER_ID',
  appId: 'TU_APP_ID',
};

/** True cuando reemplazaste los placeholders en este archivo (pedidos y sync en la nube). */
export function isFirebaseConfigured(): boolean {
  return (
    firebaseConfig.apiKey !== 'TU_API_KEY' &&
    firebaseConfig.messagingSenderId !== 'TU_SENDER_ID' &&
    firebaseConfig.appId !== 'TU_APP_ID'
  );
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
