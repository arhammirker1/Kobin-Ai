import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getGroqClient, GROQ_MODEL } from "@/lib/ai/groq"
import { buildCommandContext } from "@/lib/ai/command-context"
import { AI_TOOLS } from "@/lib/ai/tools"
import { executeAction, executeDeleteTaskConfirmed } from "@/lib/ai/action-executor"
import type { AIToolName } from "@/lib/ai/tools"
import type { ActionContext } from "@/lib/ai/action-executor"
import { NextResponse } from "next/server"

// ── Confirmed delete endpoint ───────────────────────────────────────────────
// Separate handler for user-confirmed deletions (called from frontend button)

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { task_id } = await request.json()
    if (!task_id) return NextResponse.json({ error: "task_id required" }, { status: 400 })

    const result = await executeDeleteTaskConfirmed(task_id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── Main POST handler ───────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { message, history = [] } = await request.json()
    if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 })

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

    console.log("[CMD-ROUTE] user.id:", user.id, "resolved founder_id:", founder_id)
    const { contextText, teamMembers, projects } = await buildCommandContext(founder_id)

    // Build action context for the executor
    const actionContext: ActionContext = {
      founder_id,
      user_id: user.id,
      team: teamMembers,
      projects,
    }

    const systemPrompt = `You are the AI command interface for Command Center — an agency operating system. You have full visibility into the entire workspace and can EXECUTE ACTIONS, not just answer questions.

${contextText}

## Your Role — Manager Agent
You are an AI manager. You can both ANSWER questions AND EXECUTE actions using tools.

## When to Use Tools
- User says "create a task", "add a task", "make a task" → use create_task
- User says "update", "change", "modify", "set", "move" a task → use update_task
- User says "delete", "remove" a task → use delete_task
- User says "create a project", "start a project", "new project" → use create_project
- User says "update project", "change project status" → use update_project

## When to Ask for More Info (DO NOT call a tool yet)
- If user says "create a task" but doesn't give a title → ASK for the title first
- If you cannot determine the minimum required fields → ASK for them
- Be smart: extract as much as you can from the user's message. Only ask for what's truly missing.

## Smart Defaults & Intelligence
- Priority defaults to "medium" if not mentioned
- Status defaults to "todo" if not mentioned
- Bucket is auto-determined from due_date: today → "today", this week → "this-week", has assignee → "delegated", else → "backlog"
- When assigning tasks, CHECK THE TEAM WORKLOAD section and suggest the person with the fewest active tasks
- Always explain your reasoning for suggestions: "I'd suggest assigning to X — they currently have the lightest workload with N active tasks"
- When the user mentions a person or project by name, match it against the known roster/list

## After Executing an Action
- Confirm what was done with specific details in a clear, structured format
- If you used smart defaults, mention them so the founder can override if needed
- If a tool call fails, explain the error and suggest how to fix it

## General Guidelines
- Be direct, structured, and actionable. Founders are busy.
- When listing items, use clear structure (numbered lists, bullet points).
- Reference specific names, deadlines, and amounts where relevant.
- Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`

    console.log("[CMD-ROUTE] System prompt length:", systemPrompt.length, "chars")
    console.log("[CMD-ROUTE] User message:", message)

    const groq = getGroqClient()

    // ── Step 1: Non-streamed call with tools ────────────────────────────────
    // This checks if the LLM wants to call a tool or respond directly

    const messagesForLLM = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ]

    const initialResponse = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: messagesForLLM,
      tools: AI_TOOLS,
      tool_choice: "auto",
      max_tokens: 1024,
      temperature: 0.3,
    })

    const initialChoice = initialResponse.choices[0]
    const toolCalls = initialChoice?.message?.tool_calls

    // ── Step 2: If tool calls exist, execute them ──────────────────────────
    if (toolCalls && toolCalls.length > 0) {
      console.log("[CMD-ROUTE] Tool calls detected:", toolCalls.length)
      
      const toolResults: Array<{ tool_call_id: string; role: "tool"; content: string }> = []
      const actionEvents: Array<Record<string, any>> = []

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name as AIToolName
        let toolArgs: Record<string, any> = {}
        
        try {
          toolArgs = JSON.parse(toolCall.function.arguments)
        } catch {
          toolArgs = {}
        }

        console.log(`[CMD-ROUTE] Executing tool: ${toolName}`, toolArgs)
        const result = await executeAction(toolName, toolArgs, actionContext)
        console.log(`[CMD-ROUTE] Tool result:`, JSON.stringify(result))

        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          content: JSON.stringify(result),
        })

        // Track action events to send to frontend
        if (result.success) {
          actionEvents.push({
            tool: toolName,
            ...result.data,
            needs_confirmation: result.needs_confirmation,
            confirmation_action: result.confirmation_action,
          })
        }
      }

      // ── Step 3: Stream the final response with tool results ─────────────
      const finalStream = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          ...messagesForLLM,
          initialChoice.message, // assistant message with tool_calls
          ...toolResults,
        ],
        stream: true,
        max_tokens: 1024,
        temperature: 0.5,
      })

      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        async start(controller) {
          try {
            // Send action events first so frontend can process them
            for (const event of actionEvents) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "action_executed", ...event })}\n\n`)
              )
            }

            // Then stream the LLM's narration
            for await (const chunk of finalStream) {
              const delta = chunk.choices[0]?.delta?.content || ""
              if (delta) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`)
                )
              }
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
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
    }

    // ── No tool calls: stream the direct text response ─────────────────────
    // (The LLM chose to respond with text — e.g., answering a question or
    // asking for more info before executing an action)

    const directStream = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: messagesForLLM,
      stream: true,
      max_tokens: 1024,
      temperature: 0.5,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of directStream) {
            const delta = chunk.choices[0]?.delta?.content || ""
            if (delta) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`)
              )
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
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
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
