/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// Serve the app shell for client-side routes, except API and auth handler paths.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/__\//] }));

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (config.apiKey && config.messagingSenderId && import.meta.env.VITE_USE_EMULATORS !== 'true') {
  const messaging = getMessaging(initializeApp(config));
  onBackgroundMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? 'CourtSync';
    self.registration.showNotification(title, {
      body: payload.notification?.body,
      icon: '/icon-192.png',
      data: { link: payload.data?.link ?? '/' },
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data?.link as string) || '/';
  event.waitUntil(self.clients.openWindow(link));
});
