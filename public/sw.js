// public/sw.js
// Kobin Ai Service Worker - Push Notification Handler

self.addEventListener("install", (event) => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener("push", (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { type: "inbox_message", title: "New notification", body: event.data.text() }
  }

  event.waitUntil(showNotification(payload))
})

async function showNotification(payload) {
  const { type } = payload

  let options = {
    body: payload.body,
    icon: "/icon.png",
    badge: "/badge.png",
    vibrate: [200, 100, 200],
    requireInteraction: false,
    silent: false,
    data: payload,
    timestamp: Date.now(),
  }

  if (type === "meeting_reminder") {
    const isUrgent = payload.minutes_until <= 1
    options = {
      ...options,
      body: payload.body,
      icon: "/icon.png",
      badge: "/badge.png",
      vibrate: isUrgent ? [300, 100, 300, 100, 300] : [200, 100, 200],
      requireInteraction: true,
      tag: `meeting-${payload.event_id}`,
      renotify: true,
      actions: payload.meeting_link
        ? [
            { action: "join", title: "🎥 Join Now" },
            { action: "dismiss", title: "Dismiss" },
          ]
        : [{ action: "dismiss", title: "Dismiss" }],
    }
  } else if (type === "task_assigned") {
    const priorityEmoji = {
      urgent: "🔴",
      high: "🟠",
      medium: "🟡",
      low: "🔵",
    }[payload.priority?.toLowerCase()] || "📋"

    options = {
      ...options,
      body: payload.body,
      icon: "/icon.png",
      badge: "/badge.png",
      vibrate: [150, 50, 150],
      requireInteraction: false,
      tag: `task-${payload.task_id}`,
      actions: [
        { action: "view", title: `${priorityEmoji} View Task` },
        { action: "dismiss", title: "Later" },
      ],
    }
  } else if (type === "inbox_message") {
    options = {
      ...options,
      body: payload.body,
      icon: "/icon.png",
      badge: "/badge.png",
      vibrate: [100, 50, 100],
      requireInteraction: false,
      tag: `room-${payload.room_id}-${Date.now()}`,
      actions: [
        { action: "reply", title: "💬 Reply" },
        { action: "view", title: "Open" },
      ],
    }
  }

  await self.registration.showNotification(payload.title, options)
}

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  const payload = event.notification.data
  const action = event.action

  event.notification.close()

  if (payload.type === "meeting_reminder") {
    if (action === "join" && payload.meeting_link) {
      event.waitUntil(clients.openWindow(payload.meeting_link))
    } else {
      event.waitUntil(focusOrOpen("/"))
    }
  } else if (payload.type === "task_assigned") {
    event.waitUntil(focusOrOpen("/"))
  } else if (payload.type === "inbox_message") {
    if (action === "reply") {
      // Open app focused on inbox
      event.waitUntil(focusOrOpen(`/?tab=Inbox&room=${payload.room_id}`))
    } else {
      event.waitUntil(focusOrOpen(`/?tab=Inbox&room=${payload.room_id}`))
    }
  } else {
    event.waitUntil(focusOrOpen("/"))
  }
})

async function focusOrOpen(url) {
  const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true })
  for (const client of windowClients) {
    if (client.url.includes(self.location.origin)) {
      await client.focus()
      client.postMessage({ type: "NOTIFICATION_CLICK", url })
      return
    }
  }
  await clients.openWindow(url)
}

// Handle push subscription change
self.addEventListener("pushsubscriptionchange", async (event) => {
  event.waitUntil(
    fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: event.oldSubscription?.endpoint }),
    }).catch(() => {})
  )
})