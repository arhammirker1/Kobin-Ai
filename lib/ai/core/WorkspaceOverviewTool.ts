import { z } from "zod"
import { BaseTool } from "./BaseTool"
import type { ActionContext } from "../action-executor"
import { supabaseAdmin } from "@/lib/supabase/admin"

const InputSchema = z.object({})

export class WorkspaceOverviewTool extends BaseTool<typeof InputSchema> {
  public readonly name = "get_workspace_overview"
  public readonly description = "Get detailed workspace stats — task breakdowns, project list, pipeline summary, upcoming event count. Call this for broad situational awareness."
  public readonly inputSchema = InputSchema

  public async execute(input: z.infer<typeof InputSchema>, context: ActionContext) {
    const founderId = context.founder_id
    const now = new Date()
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

    const [tasksRes, projectsRes, teamRes, dealsRes, eventsRes] = await Promise.all([
      supabaseAdmin
        .from("tasks")
        .select("id, title, status, priority, due_date, project_id, is_completed")
        .eq("user_id", founderId)
        .eq("is_completed", false),
      supabaseAdmin
        .from("projects")
        .select("id, name, status, priority")
        .eq("founder_id", founderId),
      supabaseAdmin
        .from("team_members")
        .select("id")
        .eq("founder_id", founderId)
        .eq("is_active", true),
      supabaseAdmin
        .from("relationships")
        .select("id, deal_value, pipeline_stage, stage_entered_at, close_probability")
        .eq("user_id", founderId)
        .eq("status", "active"),
      supabaseAdmin
        .from("events")
        .select("id")
        .eq("user_id", founderId)
        .gte("start_time", now.toISOString())
        .lte("start_time", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
    ])

    const tasks = tasksRes.data || []
    const projects = projectsRes.data || []
    const deals = dealsRes.data || []
    
    // Summary logic...
    const activeDeals = deals.filter((d) => !["closed_won", "closed_lost"].includes(d.pipeline_stage))
    const pipelineValue = activeDeals.reduce((s, d) => s + (d.deal_value || 0), 0)
    
    const overdue = tasks.filter((t) => t.due_date && new Date(t.due_date) < now).length
    const blocked = tasks.filter((t) => t.status === "blocked").length

    const lines: string[] = []
    lines.push(`## Workspace Overview`)
    lines.push(`Active Tasks: ${tasks.length} | Overdue: ${overdue} | Blocked: ${blocked}`)
    lines.push(`Projects: ${projects.length} | CRM Value: $${pipelineValue.toLocaleString()}`)
    lines.push(`Team: ${teamRes.data?.length || 0} active members`)
    lines.push(`Calendar: ${eventsRes.data?.length || 0} events this week`)

    return { 
      success: true,
      content: lines.join("\n") 
    }
  }
}
