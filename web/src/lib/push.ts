import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { app, db } from './firebase';

const VAPID = import.meta.env.VITE_FCM_VAPID_KEY as string | undefined;

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && !!VAPID;
}

/** Asks permission, gets an FCM token for this browser, and stores it on the user's profile. */
export async function enablePush(uid: string): Promise<string> {
  if (!pushSupported()) throw new Error('Push notifications are not available in this browser or not configured.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings.');
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) throw new Error('Push notifications are not supported in this browser.');
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: VAPID, serviceWorkerRegistration: registration });
  await setDoc(doc(db, 'users', uid, 'fcmTokens', token), { token, platform: 'web', updatedAt: serverTimestamp() });
  localStorage.setItem('cs-push-token', token);
  return token;
}

export async function disablePush(uid: string): Promise<void> {
  const token = localStorage.getItem('cs-push-token');
  if (!token) return;
  try {
    const { getMessaging, deleteToken } = await import('firebase/messaging');
    await deleteToken(getMessaging(app));
  } catch {
    // Token may already be invalid; removing our record is what matters.
  }
  await deleteDoc(doc(db, 'users', uid, 'fcmTokens', token));
  localStorage.removeItem('cs-push-token');
}

export function pushEnabledHere(): boolean {
  try {
    return !!localStorage.getItem('cs-push-token') && Notification.permission === 'granted';
  } catch {
    return false;
  }
}
