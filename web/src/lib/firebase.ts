import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-courtsync.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-courtsync',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'demo-courtsync.appspot.com',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID || 'demo-app',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const useEmulators = env.VITE_USE_EMULATORS === 'true' || firebaseConfig.projectId.startsWith('demo-');

export const app = initializeApp(firebaseConfig);

if (!useEmulators && env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY), isTokenAutoRefreshEnabled: true });
}

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: useEmulators ? undefined : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
});
export const functions = getFunctions(app, env.VITE_FUNCTIONS_REGION || 'us-central1');
export const storage = getStorage(app);

if (useEmulators) {
  const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
  connectStorageEmulator(storage, host, 9199);
}
