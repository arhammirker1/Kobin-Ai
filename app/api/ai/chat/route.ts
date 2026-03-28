import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient, GROQ_MODEL } from "@/lib/ai/groq"
import { buildContext } from "@/lib/ai/context"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { message, room_id, project_id } = await request.json()
    if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 })

    // Resolve founder_id — team members use their founder's context
    let founder_id = user.id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_type")
      .eq("id", user.id)
      .single()

    if (profile?.user_type === "team_member") {
      const { data: tm } = await supabaseAdmin
        .from("team_members")
        .select("founder_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single()
      if (tm?.founder_id) founder_id = tm.founder_id
    }

    // Build workspace context
    const context = await buildContext({ founder_id, room_id, project_id })

    // System prompt
    const systemPrompt = `You are the AI assistant built into Command Center — an agency operating system. You have full visibility into the workspace.

${context}

## Your Role
- You are embedded in the team inbox. Respond conversationally but precisely.
- You have read the full operational context above. Reference it naturally — don't recite it back.
- Be direct and useful. Founders are busy. No filler, no disclaimers.
- When drafting messages or documents, match a professional but human tone.
- If asked to create tasks, list them clearly so the founder can act on them.
- Today's date is already in the context. Use it for anything time-relative.`

    // Stream from Groq
    const groq = getGroqClient()
    const stream = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
    })

    // Save message to DB first (we'll update it as stream completes)
    const { data: savedMessage, error: insertError } = await supabaseAdmin
      .from("chat_messages")
      .insert({
        room_id,
        sender_id: user.id,
        content: "...",
        is_ai: true,
        ai_model: GROQ_MODEL,
        message_type: "ai_response",
      })
      .select("id")
      .single()

    if (insertError) {
      console.error("[AI Chat] Failed to save message:", insertError)
    }

    // Stream response back to client
    const encoder = new TextEncoder()
    let fullContent = ""

    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send message ID first so client can update it
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "id", message_id: savedMessage?.id })}\n\n`)
          )

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || ""
            if (delta) {
              fullContent += delta
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`)
              )
            }
          }

          // Update DB with final content
          if (savedMessage?.id) {
            await supabaseAdmin
              .from("chat_messages")
              .update({ content: fullContent })
              .eq("id", savedMessage.id)
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done", content: fullContent })}\n\n`)
          )
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    console.error("[AI Chat]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}