/* global self, clients */
self.addEventListener('push', (event) => {
  let data = {
    title: 'New turf booking',
    body: 'A new booking was received.',
    url: '/admin'
  };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (err) {
    console.error('push parse error', err);
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'New turf booking', {
      body: data.body || '',
      data: { url: data.url || '/admin', bookingId: data.bookingId },
      requireInteraction: true
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/admin';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
