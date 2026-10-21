/**
 * Service Worker — handles browser push notifications.
 *
 * Events:
 *  - push: Show notification with rich payload (icon, badge, actions)
 *  - notificationclick: Deep-link to exact chat/message
 *  - notificationclose: Report dismissal for multi-device sync
 *  - pushsubscriptionchange: Auto re-subscribe on token rotation
 */

/* eslint-env serviceworker */

const APP_NAME = 'FlowTask Chat';
const DEFAULT_ICON = '/icon-192x192.png';
const DEFAULT_BADGE = '/badge.png';

// ─── Push Event ──────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: APP_NAME,
      body: event.data.text() || 'New notification',
    };
  }

  // Handle silent badge-clear pushes
  if (payload.data?.type === 'badge_clear') {
    event.waitUntil(
      self.registration.getNotifications().then((notifications) => {
        notifications.forEach((n) => n.close());
      }),
    );
    return;
  }

  if(payload.data?.type==='huddle_invitation'){
    const data=payload.data;
    if(!Number.isFinite(data.expiresAt) || data.expiresAt<=Date.now())return;
    event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
      for(const client of clients)client.postMessage({type:'huddle:invitation',invitation:data});
      if(clients.some(client=>client.visibilityState==='visible'))return;
      return self.registration.showNotification(payload.title || 'Incoming Huddle',{
        body:payload.body || 'Join the conversation',icon:payload.icon || DEFAULT_ICON,
        tag:'huddle:'+data.id,requireInteraction:true,data,actions:[{action:'join',title:'Join'},{action:'dismiss',title:'Dismiss'}],
      });
    }));return;
  }
  const title = payload.title || APP_NAME;
  const options = {
    body: payload.body || '',
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
    tag: payload.tag || `notif-${Date.now()}`,
    renotify: true,
    requireInteraction: payload.data?.priority === 'high',
    silent: false,
    vibrate: [200, 100, 200],
    data: payload.data || {},
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    timestamp: payload.timestamp || Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification Click ──────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  notification.close();

  if(data.type==='huddle_invitation'){
    if(action==='dismiss' || data.expiresAt<=Date.now())return;
    const destination=new URL(data.deepLink || '/',self.location.origin);
    if(destination.origin!==self.location.origin)return;
    event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
      const client=clients.find(client=>client.url.startsWith(self.location.origin));
      if(client){await client.navigate(destination.href);return client.focus();}
      return self.clients.openWindow(destination.href);
    }));return;
  }
  if (action === 'dismiss') {
    // Report dismissal to server for multi-device sync
    if (data.notificationId) {
      event.waitUntil(reportDismissal(data.notificationId));
    }
    return;
  }

  // Deep-link to the exact chat/message
  const deepLink = data.deepLink || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to find an existing app window and navigate it
      for (const client of clientList) {
        if (client.url.includes('/workspace/') && 'focus' in client) {
          return client.navigate(deepLink).then(() => client.focus());
        }
      }
      // No existing window — open a new one
      return self.clients.openWindow(deepLink);
    }),
  );
});

// ─── Notification Close (dismissed via swipe/X button) ───────────────────────

self.addEventListener('notificationclose', (event) => {
  const data = event.notification.data || {};
  if (data.notificationId) {
    event.waitUntil(reportDismissal(data.notificationId));
  }
});

// ─── Push Subscription Change (token rotation) ──────────────────────────────

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options).then((newSub) => {
      return fetch('/api/chat/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSub.toJSON()),
      });
    }),
  );
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function reportDismissal(notificationId) {
  try {
    await fetch('/api/chat/push/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId }),
    });
  } catch {
    // Non-critical — server will handle stale pushes
  }
}
