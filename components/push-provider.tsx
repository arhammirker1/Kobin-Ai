// components/push-provider.tsx
"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"

export function PushProvider() {
  const supabase = createClient()
  const registeredRef = useRef(false)

  useEffect(() => {
    if (registeredRef.current) return
    registeredRef.current = true
    // Small delay so auth session is ready
    setTimeout(registerPush, 1500)
  }, [])

  const registerPush = async () => {
    console.log("[Push] Starting registration...")

    // Skip web push entirely when running inside Electron desktop app —
    // DesktopNotificationProvider handles native notifications there.
    if ((window as any).electron?.isDesktop) {
      console.log("[Push] ❌ Desktop app detected — skipping web push (native notifications active)")
      return
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.log("[Push] ❌ Not supported in this browser")
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.log("[Push] ❌ No user — skipping")
      return
    }
    console.log("[Push] ✅ User:", user.id)

    try {
      // Register SW
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
      await navigator.serviceWorker.ready
      console.log("[Push] ✅ SW ready")

      const currentPermission = Notification.permission
      console.log("[Push] Permission:", currentPermission)

      if (currentPermission === "denied") {
        console.warn("[Push] ⚠️ Blocked — reset in browser site settings")
        return
      }

      // Request if not granted yet
      if (currentPermission !== "granted") {
        console.log("[Push] Requesting permission...")
        const result = await Notification.requestPermission()
        console.log("[Push] Permission result:", result)
        if (result !== "granted") return
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        console.error("[Push] ❌ NEXT_PUBLIC_VAPID_PUBLIC_KEY not set in env!")
        return
      }

      // Get or create subscription
      let subscription = await registration.pushManager.getSubscription()
      console.log("[Push] Existing subscription:", subscription ? "YES" : "NO")

      if (!subscription) {
        console.log("[Push] Creating new subscription...")
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        })
        console.log("[Push] ✅ Subscription created")
      }

      // ALWAYS save to DB — handles the case where sub exists in browser
      // but was never saved to DB (e.g. after permission reset)
      const subJson = subscription.toJSON()
      console.log("[Push] Saving subscription to DB...")
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth,
        }),
      })
      const resJson = await res.json()
      console.log("[Push] DB save result:", resJson)

      // Listen for SW messages (notification click → deep link navigation)
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "NOTIFICATION_CLICK") {
          const url = new URL(event.data.url, window.location.origin)
          const tab = url.searchParams.get("tab")
          const room = url.searchParams.get("room")
          if (tab) {
            window.dispatchEvent(new CustomEvent("push-navigate", { detail: { tab, room } }))
          }
        }
      })

      console.log("[Push] 🎉 Push notifications active!")

    } catch (err) {
      console.error("[Push] ❌ Registration failed:", err)
    }
  }

  return null
}

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