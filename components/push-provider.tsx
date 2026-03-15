// components/push-provider.tsx
"use client"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

// Helper to send push to a user (call from server-side routes)
export async function sendPushToUser(userId: string, payload: object) {
  try {
    await fetch("/api/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify({ user_id: userId, payload }),
    })
  } catch (err) {
    console.warn("Push send failed:", err)
  }
}

export function PushProvider() {
  const supabase = createClient()
  const registeredRef = useRef(false)

  useEffect(() => {
    if (registeredRef.current) return
    registeredRef.current = true
    registerPush()
  }, [])

  const registerPush = async () => {
    // Check browser support
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.log("Push notifications not supported")
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Register service worker
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      })

      await navigator.serviceWorker.ready

      // Check existing subscription
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        // Request permission first
        const permission = await Notification.requestPermission()
        if (permission !== "granted") {
          console.log("Push permission denied")
          return
        }

        // Subscribe
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) {
          console.error("NEXT_PUBLIC_VAPID_PUBLIC_KEY not set")
          return
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        })
      }

      // Save subscription to server
      const subJson = subscription.toJSON()
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth,
        }),
      })

      // Listen for messages from SW (notification clicks)
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "NOTIFICATION_CLICK") {
          const url = new URL(event.data.url, window.location.origin)
          const tab = url.searchParams.get("tab")
          const room = url.searchParams.get("room")
          if (tab) {
            // Dispatch a custom event that the dashboard can listen to
            window.dispatchEvent(new CustomEvent("push-navigate", { detail: { tab, room } }))
          }
        }
      })

    } catch (err) {
      console.warn("Push registration failed:", err)
    }
  }

  return null // This component has no UI
}

// Convert VAPID key from base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}