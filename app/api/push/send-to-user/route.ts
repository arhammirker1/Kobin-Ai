// app/api/push/send-to-user/route.ts
import { NextResponse } from "next/server"
import { pushToUser } from "@/lib/web-push/push-to-user"
import { PushPayload } from "@/lib/web-push/send"

export async function POST(req: Request) {
  const { user_id, payload } = await req.json() as { user_id: string; payload: PushPayload }

  if (!user_id || !payload) {
    return NextResponse.json({ error: "user_id and payload required" }, { status: 400 })
  }

  await pushToUser(user_id, payload)
  return NextResponse.json({ success: true })
}