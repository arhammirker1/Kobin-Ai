import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase is not configured, allow the request to proceed
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase environment variables missing in middleware")
    return NextResponse.next({
      request,
    })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
      },
    },
  })

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const isAuthPage = request.nextUrl.pathname.startsWith("/login")
    const isPublicAsset = request.nextUrl.pathname.match(/\.(svg|png|jpg|jpeg|gif|webp)$/)
    // External service endpoints — called by Google Pub/Sub, Vercel Cron, Electron desktop app, etc. without a user session
    const isExternalEndpoint =
      request.nextUrl.pathname.startsWith("/api/gmail/webhook") ||
      request.nextUrl.pathname.startsWith("/api/cron/") ||
      request.nextUrl.pathname.startsWith("/api/meeting-bot/") ||
      request.nextUrl.pathname.startsWith("/api/push/")

    if (!user && !isAuthPage && !isPublicAsset && !isExternalEndpoint && request.nextUrl.pathname !== "/") {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      return NextResponse.redirect(url)
    }
  } catch (error) {
    console.error("Auth check failed in middleware:", error)
  }

  return supabaseResponse
}
