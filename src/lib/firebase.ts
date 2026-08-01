import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';

// Firebase web config is public by design -- it ships in the JS bundle of
// every Firebase web app and identifies the project, it doesn't authorize
// anything (FCM sends are authorized by the service-account key, which
// lives only in a Supabase edge-function secret). It's hardcoded rather
// than env-driven so that public/firebase-messaging-sw.js -- a static
// file Vite never processes, and so can't read import.meta.env -- can
// hold the same values without a second source of truth drifting.
//
// KEEP IN SYNC with public/firebase-messaging-sw.js if this ever changes.
export const firebaseConfig = {
  apiKey: 'AIzaSyD8bw-eKs-dIeAU3eHkbdHcAqrEp_-Sup4',
  authDomain: 'bhavan-f7b8e.firebaseapp.com',
  projectId: 'bhavan-f7b8e',
  storageBucket: 'bhavan-f7b8e.firebasestorage.app',
  messagingSenderId: '594132053257',
  appId: '1:594132053257:web:9423ed7c851d7bf08f77d8',
};

// Web Push VAPID public key (Firebase Console -> Cloud Messaging ->
// Web Push certificates). Public half of the keypair; the private half
// stays with Google.
export const VAPID_PUBLIC_KEY =
  'BLv-SiREE0FKiz-2nlDIkg3_EFkTzKYb45lTGrK84EMhNP7ireIncpxg6A99SXeaCtzapVe_gF-tmRYXimRWCIU';

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

// Returns null where FCM can't run (no service worker / no Push API --
// notably iOS Safari before 16.4, and any non-HTTPS origin other than
// localhost) rather than throwing, so callers can degrade quietly.
export async function getFirebaseMessaging(): Promise<Messaging | null> {
  try {
    if (!(await isSupported())) return null;
    return getMessaging(getFirebaseApp());
  } catch {
    return null;
  }
}
