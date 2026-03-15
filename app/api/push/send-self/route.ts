// app/api/push/send-self/route.ts
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { pushToUser } from "@/lib/web-push/push-to-user"
import { PushPayload } from "@/lib/web-push/send"

// Client components can call this to push to themselves
// (since they can't use web-push directly)
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { payload } = await req.json() as { payload: PushPayload }
  if (!payload) return NextResponse.json({ error: "payload required" }, { status: 400 })

  await pushToUser(user.id, payload)
  return NextResponse.json({ success: true })
}