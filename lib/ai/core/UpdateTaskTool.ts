import { z } from "zod"
import { BaseTool } from "./BaseTool"
import type { ActionContext, ActionResult, VaultAttachment } from "../action-executor"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { 
  normalizeEnumValue, 
  parseIsoDateSafe, 
  resolveTeamMember, 
  resolveProject, 
  resolveVaultFiles, 
  generateLinkLabel 
} from "../action-executor"

const InputSchema = z.object({
  task_title: z.string().describe("Task title to find (fuzzy match)"),
  new_title: z.string().optional().describe("New title if renaming"),
  notes: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z.enum(["todo", "in-progress", "blocked", "completed"]).optional(),
  due_date: z.string().optional().describe("ISO 8601 format"),
  assigned_to_name: z.string().optional(),
  project_name: z.string().optional(),
  bucket: z.enum(["today", "this-week", "delegated", "backlog"]).optional(),
  vault_file_names: z.array(z.string()).optional(),
  external_links: z.array(z.object({
    url: z.string(),
    label: z.string().optional()
  })).optional()
})

export class UpdateTaskTool extends BaseTool<typeof InputSchema> {
  public readonly name = "update_task"
  public readonly description = "Update an existing task by title. Only include fields to change. Use read tools to resolve names."
  public readonly inputSchema = InputSchema

  public async execute(input: z.infer<typeof InputSchema>, context: ActionContext): Promise<ActionResult> {
    const { task_title, new_title, notes, priority, status, due_date, assigned_to_name, project_name, bucket, vault_file_names, external_links } = input
    const founderId = context.founder_id

    // Find the task (using fuzzy match)
    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("*")
      .eq("user_id", founderId)
      .ilike("title", `%${task_title}%`)
      .limit(1)
      .single()

    if (!task) {
      return { success: false, message: `Could not find task matching "${task_title}".` }
    }

    const updateData: Record<string, any> = {}
    const changes: string[] = []

    if (new_title) {
      updateData.title = new_title
      changes.push(`Title -> "${new_title}"`)
    }
    if (notes !== undefined) {
      updateData.notes = notes || null
    }
    if (priority) {
      updateData.priority = priority
      changes.push(`Priority -> ${priority}`)
    }
    if (status) {
      updateData.status = status
      updateData.is_completed = status === "completed"
      changes.push(`Status -> ${status}`)
    }
    if (due_date) {
      const parsed = parseIsoDateSafe(due_date)
      if (parsed) {
        updateData.due_date = parsed
        changes.push(`Due Date -> ${parsed}`)
      }
    }
    
    // Resolve assignee
    if (assigned_to_name) {
      const member = await resolveTeamMember(assigned_to_name, context.team, founderId)
      if (member) {
        updateData.assigned_to = member.user_id
        changes.push(`Assigned To -> ${member.full_name}`)
      }
    }

    // Resolve project
    let resolvedProjectId = task.project_id
    if (project_name) {
      const project = await resolveProject(project_name, context.projects, founderId)
      if (project) {
        updateData.project_id = project.id
        resolvedProjectId = project.id
        changes.push(`Project -> ${project.name}`)
      }
    }

    // Resolve vault files (merge with existing)
    if (vault_file_names && vault_file_names.length > 0 && resolvedProjectId) {
      const result = await resolveVaultFiles(vault_file_names, resolvedProjectId, founderId)
      if (result.matched.length > 0) {
        const existing: VaultAttachment[] = task.vault_attachments || []
        const merged = [...existing]
        for (const newFile of result.matched) {
          if (!merged.some(m => m.vault_item_id === newFile.vault_item_id)) {
            merged.push(newFile)
          }
        }
        updateData.vault_attachments = merged
        changes.push(`Added ${result.matched.length} vault files.`)
      }
    }

    // External links (merge)
    if (external_links && external_links.length > 0) {
      const newResources = external_links.map(l => ({
        url: l.url,
        title: generateLinkLabel(l.url, l.label)
      }))
      const existing = task.resources || []
      const merged = [...existing]
      for (const nr of newResources) {
        if (!merged.some(m => m.url === nr.url)) {
          merged.push(nr)
        }
      }
      updateData.resources = merged
      changes.push(`Added ${newResources.length} links.`)
    }

    if (Object.keys(updateData).length === 0) {
      return { success: false, message: "No actual changes specified." }
    }

    const { error } = await supabaseAdmin
      .from("tasks")
      .update(updateData)
      .eq("id", task.id)

    if (error) {
      return { success: false, message: `Failed to update task: ${error.message}` }
    }

    return {
      success: true,
      message: `Task "${task.title}" updated successfully.`,
      data: {
        task_id: task.id,
        changes
      }
    }
  }
}
