/* Firebase Cloud Messaging service worker.
 *
 * Handles pushes that arrive while the site is closed or backgrounded
 * (foreground messages are handled by the onMessage listener in
 * src/hooks/usePushNotifications.ts instead).
 *
 * This file is served as-is from /public -- Vite does not transform it,
 * so it can't import from src/ or read import.meta.env. The config below
 * must therefore be kept in sync with src/lib/firebase.ts by hand. These
 * are public client identifiers, not secrets.
 *
 * Loaded via the compat build because service workers can't use ES module
 * imports across all browsers we target.
 */
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyD8bw-eKs-dIeAU3eHkbdHcAqrEp_-Sup4',
  authDomain: 'bhavan-f7b8e.firebaseapp.com',
  projectId: 'bhavan-f7b8e',
  storageBucket: 'bhavan-f7b8e.firebasestorage.app',
  messagingSenderId: '594132053257',
  appId: '1:594132053257:web:9423ed7c851d7bf08f77d8',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'Bhavan';
  const body = (payload.notification && payload.notification.body) || '';
  const actionUrl = (payload.data && payload.data.actionUrl) || '/notifications';

  self.registration.showNotification(title, {
    body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { actionUrl },
    tag: (payload.data && payload.data.notificationId) || undefined,
  });
});

// Focus an already-open tab rather than piling up duplicates, and deep
// link to whatever the notification was about.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.actionUrl) || '/notifications';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
