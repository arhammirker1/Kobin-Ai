import { z } from "zod"
import { BaseTool } from "./BaseTool"
import type { ActionContext, ActionResult, VaultAttachment } from "../action-executor"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { 
  normalizeEnumValue, 
  parseIsoDateSafe, 
  parseBooleanLike, 
  resolveTeamMember, 
  resolveProject, 
  resolveVaultFiles, 
  generateLinkLabel, 
  smartBucket 
} from "../action-executor"

const InputSchema = z.object({
  title: z.string().describe("Task title"),
  notes: z.string().optional().describe("Additional context"),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
  status: z.enum(["todo", "in-progress", "blocked", "completed"]).optional().default("todo"),
  due_date: z.string().optional().describe("ISO 8601 format (YYYY-MM-DDTHH:mm:ss)"),
  assigned_to_name: z.string().optional().describe("Team member name to assign to"),
  project_name: z.string().optional().describe("Project name to link to"),
  bucket: z.enum(["today", "this-week", "delegated", "backlog"]).optional(),
  deliverable_required: z.boolean().optional().default(false),
  deliverable_description: z.string().optional(),
  vault_file_names: z.array(z.string()).optional(),
  external_links: z.array(z.object({
    url: z.string(),
    label: z.string().optional()
  })).optional()
})

export class CreateTaskTool extends BaseTool<typeof InputSchema> {
  public readonly name = "create_task"
  public readonly description = "Create a task in ONE call with ALL details. Requires title. Use read tools first to resolve names."
  public readonly inputSchema = InputSchema

  public async execute(input: z.infer<typeof InputSchema>, context: ActionContext): Promise<ActionResult> {
    const { title, notes, priority, status, due_date, assigned_to_name, project_name, bucket, deliverable_required, deliverable_description, vault_file_names, external_links } = input
    const founderId = context.founder_id

    const normalizedPriority = normalizeEnumValue(priority, ["low", "medium", "high", "urgent"], "medium")
    const normalizedStatus = normalizeEnumValue(status, ["todo", "in-progress", "blocked", "completed"], "todo")
    const normalizedDueDate = due_date ? parseIsoDateSafe(due_date) : null
    
    let effectiveDueDate = normalizedDueDate
    if (effectiveDueDate && new Date(effectiveDueDate) < new Date() && normalizedStatus !== "completed") {
      const now = new Date()
      const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
      effectiveDueDate = endToday.toISOString()
    }

    // Resolve assignee
    let assignedTo: string | null = null
    let assigneeName: string | null = null
    if (assigned_to_name) {
      const member = await resolveTeamMember(assigned_to_name, context.team, founderId)
      if (member) {
        assignedTo = member.user_id
        assigneeName = member.full_name
      }
    }

    // Resolve project
    let projectId: string | null = null
    let projectNameResolved: string | null = null
    if (project_name) {
      const project = await resolveProject(project_name, context.projects, founderId)
      if (project) {
        projectId = project.id
        projectNameResolved = project.name
      }
    }

    // Resolve vault files
    let vaultAttachments: VaultAttachment[] | null = null
    let unmatchedFiles: string[] = []
    if (vault_file_names && vault_file_names.length > 0 && projectId) {
      const result = await resolveVaultFiles(vault_file_names, projectId, founderId)
      vaultAttachments = result.matched.length > 0 ? result.matched : null
      unmatchedFiles = result.unmatched
    }

    // Build resource list
    let resources: Array<{ url: string; title: string }> | null = null
    if (external_links && external_links.length > 0) {
      resources = external_links.map(link => ({
        url: link.url,
        title: generateLinkLabel(link.url, link.label)
      }))
    }

    const resolvedBucket = bucket || smartBucket(effectiveDueDate || undefined, !!assignedTo)

    const insertData = {
      user_id: founderId,
      created_by: context.user_id,
      title: title.trim(),
      notes: notes || null,
      priority: normalizedPriority,
      status: normalizedStatus,
      due_date: effectiveDueDate,
      assigned_to: assignedTo,
      project_id: projectId,
      bucket: resolvedBucket,
      is_completed: normalizedStatus === "completed",
      deliverable_required: deliverable_required,
      deliverable_description: deliverable_description || null,
      resources: resources,
      vault_attachments: vaultAttachments,
    }

    const { data, error } = await supabaseAdmin
      .from("tasks")
      .insert(insertData)
      .select("id, title")
      .single()

    if (error) {
      return { success: false, message: `Failed to create task: ${error.message}` }
    }

    return {
      success: true,
      message: `Task "${title}" created successfully.`,
      data: {
        task_id: data.id,
        title: data.title,
        assigned_to: assigneeName,
        due_date: effectiveDueDate,
        project: projectNameResolved,
        priority: normalizedPriority,
        bucket: resolvedBucket,
        unmatched_files: unmatchedFiles
      }
    }
  }
}
