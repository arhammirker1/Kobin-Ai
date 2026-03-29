// ── Action Executor ──────────────────────────────────────────────────────────
// Receives tool calls from the LLM and executes them against Supabase.
// Handles name→ID resolution, workload suggestions, and smart bucket defaults.

import { supabaseAdmin } from "@/lib/supabase/admin"
import type { AIToolName } from "./tools"

// ── Types ───────────────────────────────────────────────────────────────────

export interface TeamMemberContext {
  user_id: string
  full_name: string
  position: string
  active_task_count: number
}

export interface ProjectContext {
  id: string
  name: string
  status: string
}

export interface ActionContext {
  founder_id: string
  user_id: string // the actual logged-in user (could be team member)
  team: TeamMemberContext[]
  projects: ProjectContext[]
}

export interface ActionResult {
  success: boolean
  message: string
  data?: Record<string, any>
  needs_confirmation?: boolean
  confirmation_action?: {
    tool: string
    args: Record<string, any>
    resolved_id: string
    description: string
  }
}

// ── Fuzzy name matching ─────────────────────────────────────────────────────

function fuzzyMatch(query: string, candidates: string[]): { match: string; index: number } | null {
  const q = query.toLowerCase().trim()
  if (!q) return null

  // 1. Exact match
  const exactIdx = candidates.findIndex((c) => c.toLowerCase() === q)
  if (exactIdx !== -1) return { match: candidates[exactIdx], index: exactIdx }

  // 2. Starts with
  const startsIdx = candidates.findIndex((c) => c.toLowerCase().startsWith(q))
  if (startsIdx !== -1) return { match: candidates[startsIdx], index: startsIdx }

  // 3. Contains
  const containsIdx = candidates.findIndex((c) => c.toLowerCase().includes(q))
  if (containsIdx !== -1) return { match: candidates[containsIdx], index: containsIdx }

  // 4. First name match
  const firstNameIdx = candidates.findIndex((c) => {
    const firstName = c.split(" ")[0]?.toLowerCase()
    return firstName === q || firstName?.startsWith(q)
  })
  if (firstNameIdx !== -1) return { match: candidates[firstNameIdx], index: firstNameIdx }

  return null
}

// ── Smart bucket from due_date ──────────────────────────────────────────────

function smartBucket(dueDate: string | undefined, hasAssignee: boolean): string {
  if (!dueDate) return hasAssignee ? "delegated" : "backlog"

  const due = new Date(dueDate)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)

  // Get end of this week (Sunday)
  const dayOfWeek = today.getDay()
  const endOfWeek = new Date(today.getTime() + (7 - dayOfWeek) * 24 * 60 * 60 * 1000 - 1)

  if (due <= endOfToday) return "today"
  if (due <= endOfWeek) return "this-week"
  if (hasAssignee) return "delegated"
  return "backlog"
}

// ── Resolve team member name → user_id (auto-fetches if needed) ─────────────

async function resolveTeamMember(
  name: string,
  team: TeamMemberContext[],
  founderId: string
): Promise<TeamMemberContext | null> {
  if (!name) return null

  // Auto-fetch team data if not pre-loaded by read tools
  if (team.length === 0) {
    const { data: members } = await supabaseAdmin
      .from("team_members")
      .select("user_id, position, is_active, profile:profiles!team_members_user_id_profiles_fkey(full_name)")
      .eq("founder_id", founderId)
      .eq("is_active", true)

    if (members) {
      const { data: taskData } = await supabaseAdmin
        .from("tasks")
        .select("assigned_to")
        .eq("user_id", founderId)
        .eq("is_completed", false)

      const counts: Record<string, number> = {}
      for (const t of taskData || []) {
        if (t.assigned_to) counts[t.assigned_to] = (counts[t.assigned_to] || 0) + 1
      }

      for (const m of members) {
        team.push({
          user_id: m.user_id,
          full_name: (m.profile as any)?.full_name || "Unknown",
          position: m.position || "",
          active_task_count: counts[m.user_id] || 0,
        })
      }
    }
  }

  if (team.length === 0) return null
  const names = team.map((m) => m.full_name)
  const result = fuzzyMatch(name, names)
  if (result) return team[result.index]
  return null
}

// ── Resolve project name → project_id (auto-fetches if needed) ──────────────

async function resolveProject(
  name: string,
  projects: ProjectContext[],
  founderId: string
): Promise<ProjectContext | null> {
  if (!name) return null

  // Auto-fetch project data if not pre-loaded by read tools
  if (projects.length === 0) {
    const { data } = await supabaseAdmin
      .from("projects")
      .select("id, name, status")
      .eq("founder_id", founderId)

    if (data) {
      projects.push(...data.map(p => ({ id: p.id, name: p.name, status: p.status })))
    }
  }

  if (projects.length === 0) return null
  const names = projects.map((p) => p.name)
  const result = fuzzyMatch(name, names)
  if (result) return projects[result.index]
  return null
}

// ── Resolve vault files by fuzzy title match ────────────────────────────────

interface VaultAttachment {
  vault_item_id: string
  title: string
  drive_file_url: string | null
  link_url: string | null
}

async function resolveVaultFiles(
  fileNames: string[],
  projectId: string,
  founderId: string
): Promise<{ matched: VaultAttachment[]; unmatched: string[] }> {
  if (!fileNames || fileNames.length === 0 || !projectId) {
    return { matched: [], unmatched: fileNames || [] }
  }

  // Get all vault folders for the project
  const { data: folders } = await supabaseAdmin
    .from("vault_folders")
    .select("id")
    .eq("project_id", projectId)
    .eq("founder_id", founderId)

  if (!folders || folders.length === 0) {
    return { matched: [], unmatched: fileNames }
  }

  const folderIds = folders.map((f) => f.id)

  // Get all vault items in those folders
  const { data: items } = await supabaseAdmin
    .from("vault_items")
    .select("id, title, item_type, drive_file_url, link_url")
    .in("folder_id", folderIds)
    .in("item_type", ["file", "link"])
    .eq("founder_id", founderId)

  if (!items || items.length === 0) {
    return { matched: [], unmatched: fileNames }
  }

  const matched: VaultAttachment[] = []
  const unmatched: string[] = []
  const itemTitles = items.map((i) => i.title)

  for (const name of fileNames) {
    const result = fuzzyMatch(name, itemTitles)
    if (result) {
      const item = items[result.index]
      // Avoid duplicates
      if (!matched.some((m) => m.vault_item_id === item.id)) {
        matched.push({
          vault_item_id: item.id,
          title: item.title,
          drive_file_url: item.drive_file_url || null,
          link_url: item.link_url || null,
        })
      }
    } else {
      unmatched.push(name)
    }
  }

  return { matched, unmatched }
}

// ── Generate smart label from URL ───────────────────────────────────────────

function generateLinkLabel(url: string, providedLabel?: string): string {
  if (providedLabel?.trim()) return providedLabel.trim()

  try {
    const parsed = new URL(url)
    const domain = parsed.hostname.replace(/^www\./, "")

    // Known domain mappings
    const domainLabels: Record<string, string> = {
      "figma.com": "Figma Design",
      "docs.google.com": "Google Doc",
      "sheets.google.com": "Google Sheet",
      "slides.google.com": "Google Slides",
      "drive.google.com": "Google Drive File",
      "github.com": "GitHub",
      "gitlab.com": "GitLab",
      "notion.so": "Notion Page",
      "notion.site": "Notion Page",
      "trello.com": "Trello Board",
      "miro.com": "Miro Board",
      "canva.com": "Canva Design",
      "slack.com": "Slack",
      "linear.app": "Linear Issue",
      "jira.atlassian.net": "Jira Issue",
      "asana.com": "Asana Task",
      "airtable.com": "Airtable",
      "loom.com": "Loom Video",
      "youtube.com": "YouTube Video",
      "youtu.be": "YouTube Video",
      "dropbox.com": "Dropbox File",
      "medium.com": "Medium Article",
      "stackoverflow.com": "Stack Overflow",
      "vercel.app": "Vercel Deployment",
      "netlify.app": "Netlify Deployment",
    }

    // Check exact domain match
    for (const [key, label] of Object.entries(domainLabels)) {
      if (domain === key || domain.endsWith(`.${key}`)) {
        // Refine GitHub labels
        if (key === "github.com") {
          const path = parsed.pathname
          if (path.includes("/issues/")) return "GitHub Issue"
          if (path.includes("/pull/")) return "GitHub PR"
          if (path.includes("/wiki")) return "GitHub Wiki"
          if (path.split("/").filter(Boolean).length === 2) return "GitHub Repo"
          return "GitHub Link"
        }
        return label
      }
    }

    // Fallback: capitalize domain name
    const domainName = domain.split(".")[0]
    return domainName.charAt(0).toUpperCase() + domainName.slice(1) + " Link"
  } catch {
    return "External Link"
  }
}

// ── Find task by title ──────────────────────────────────────────────────────

async function findTaskByTitle(
  title: string,
  founderId: string
): Promise<{ id: string; title: string; [key: string]: any } | null> {
  // Try exact match first
  const { data: exact } = await supabaseAdmin
    .from("tasks")
    .select("*")
    .eq("user_id", founderId)
    .eq("is_completed", false)
    .ilike("title", title)
    .limit(1)

  if (exact && exact.length > 0) return exact[0]

  // Try contains match
  const { data: contains } = await supabaseAdmin
    .from("tasks")
    .select("*")
    .eq("user_id", founderId)
    .eq("is_completed", false)
    .ilike("title", `%${title}%`)
    .limit(1)

  if (contains && contains.length > 0) return contains[0]

  return null
}

// ── Find project by name ────────────────────────────────────────────────────

async function findProjectByName(
  name: string,
  founderId: string
): Promise<{ id: string; name: string; [key: string]: any } | null> {
  const { data: exact } = await supabaseAdmin
    .from("projects")
    .select("*")
    .eq("founder_id", founderId)
    .ilike("name", name)
    .limit(1)

  if (exact && exact.length > 0) return exact[0]

  const { data: contains } = await supabaseAdmin
    .from("projects")
    .select("*")
    .eq("founder_id", founderId)
    .ilike("name", `%${name}%`)
    .limit(1)

  if (contains && contains.length > 0) return contains[0]

  return null
}

// ── Main executor ───────────────────────────────────────────────────────────

export async function executeAction(
  toolName: AIToolName,
  args: Record<string, any>,
  context: ActionContext
): Promise<ActionResult> {
  console.log(`[ACTION] Executing ${toolName}:`, JSON.stringify(args))

  switch (toolName) {
    case "create_task":
      return executeCreateTask(args, context)
    case "update_task":
      return executeUpdateTask(args, context)
    case "delete_task":
      return executeDeleteTask(args, context)
    case "create_project":
      return executeCreateProject(args, context)
    case "update_project":
      return executeUpdateProject(args, context)
    default:
      return { success: false, message: `Unknown tool: ${toolName}` }
  }
}

// ── CREATE TASK ─────────────────────────────────────────────────────────────

async function executeCreateTask(
  args: Record<string, any>,
  ctx: ActionContext
): Promise<ActionResult> {
  let { title, notes, priority, status, due_date, assigned_to_name, project_name, bucket, deliverable_required, deliverable_description, vault_file_names, external_links } = args

  // Coerce vault_file_names: model sometimes passes string instead of array
  if (vault_file_names && !Array.isArray(vault_file_names)) {
    if (typeof vault_file_names === "string" && vault_file_names.startsWith("$")) {
      // Template placeholder like "${vault_files}" — ignore it
      vault_file_names = []
    } else if (typeof vault_file_names === "string") {
      vault_file_names = [vault_file_names]
    } else {
      vault_file_names = []
    }
  }

  // Coerce external_links similarly
  if (external_links && !Array.isArray(external_links)) {
    external_links = []
  }

  if (!title?.trim()) {
    return { success: false, message: "Task title is required." }
  }

  // Resolve assignee
  let assignedTo: string | null = null
  let assigneeName: string | null = null
  if (assigned_to_name) {
    const member = await resolveTeamMember(assigned_to_name, ctx.team, ctx.founder_id)
    if (member) {
      assignedTo = member.user_id
      assigneeName = member.full_name
    } else {
      return {
        success: false,
        message: `Could not find team member "${assigned_to_name}". Available team members: ${ctx.team.map((m) => m.full_name).join(", ") || "none"}.`,
      }
    }
  }

  // Resolve project
  let projectId: string | null = null
  let projectNameResolved: string | null = null
  if (project_name) {
    const project = await resolveProject(project_name, ctx.projects, ctx.founder_id)
    if (project) {
      projectId = project.id
      projectNameResolved = project.name
    } else {
      return {
        success: false,
        message: `Could not find project "${project_name}". Available projects: ${ctx.projects.map((p) => p.name).join(", ") || "none"}.`,
      }
    }
  }

  // Resolve vault file attachments
  let vaultAttachments: VaultAttachment[] | null = null
  let unmatchedFiles: string[] = []
  if (vault_file_names && vault_file_names.length > 0 && projectId) {
    const result = await resolveVaultFiles(vault_file_names, projectId, ctx.founder_id)
    vaultAttachments = result.matched.length > 0 ? result.matched : null
    unmatchedFiles = result.unmatched
  } else if (vault_file_names && vault_file_names.length > 0 && !projectId) {
    return {
      success: false,
      message: `Cannot attach vault files without a linked project. Please specify a project first, then I can attach files from its vault.`,
    }
  }

  // Process external links with auto-labeling
  let resources: Array<{ url: string; title: string }> | null = null
  if (external_links && external_links.length > 0) {
    resources = external_links.map((link: { url: string; label?: string }) => ({
      url: link.url,
      title: generateLinkLabel(link.url, link.label),
    }))
  }

  // Determine bucket
  const resolvedBucket = bucket || smartBucket(due_date, !!assignedTo)

  const insertData = {
    user_id: ctx.founder_id,
    created_by: ctx.user_id,
    title: title.trim(),
    notes: notes || null,
    priority: priority || "medium",
    status: status || "todo",
    due_date: due_date ? new Date(due_date).toISOString() : null,
    assigned_to: assignedTo,
    project_id: projectId,
    bucket: resolvedBucket,
    is_completed: false,
    deliverable_required: deliverable_required || false,
    deliverable_description: deliverable_description || null,
    resources: resources,
    linked: null,
    vault_attachments: vaultAttachments,
  }

  const { data, error } = await supabaseAdmin
    .from("tasks")
    .insert(insertData)
    .select("id, title")
    .single()

  if (error) {
    console.error("[ACTION] create_task error:", error)
    return { success: false, message: `Failed to create task: ${error.message}` }
  }

  // Build summary
  const details: string[] = []
  details.push(`**${title}**`)
  if (assigneeName) details.push(`Assigned to: ${assigneeName}`)
  if (due_date) details.push(`Due: ${new Date(due_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`)
  if (projectNameResolved) details.push(`Project: ${projectNameResolved}`)
  details.push(`Priority: ${(priority || "medium").charAt(0).toUpperCase() + (priority || "medium").slice(1)}`)
  details.push(`Bucket: ${resolvedBucket}`)
  if (vaultAttachments && vaultAttachments.length > 0) {
    details.push(`Vault files: ${vaultAttachments.map(v => v.title).join(", ")}`)
  }
  if (resources && resources.length > 0) {
    details.push(`Links: ${resources.map(r => r.title).join(", ")}`)
  }

  // Build message with unmatched file warnings
  let message = `Task created successfully.`
  if (unmatchedFiles.length > 0) {
    message += ` Note: Could not find vault files matching: ${unmatchedFiles.map(f => `"${f}"`).join(", ")}.`
  }

  return {
    success: true,
    message,
    data: {
      task_id: data.id,
      title: data.title,
      assigned_to: assigneeName,
      due_date,
      project: projectNameResolved,
      priority: priority || "medium",
      bucket: resolvedBucket,
      vault_files_attached: vaultAttachments?.length || 0,
      links_attached: resources?.length || 0,
      unmatched_files: unmatchedFiles,
      summary: details.join(" | "),
    },
  }
}

// ── UPDATE TASK ─────────────────────────────────────────────────────────────

async function executeUpdateTask(
  args: Record<string, any>,
  ctx: ActionContext
): Promise<ActionResult> {
  const { task_title, new_title, notes, priority, status, due_date, assigned_to_name, project_name, bucket, vault_file_names, external_links } = args

  if (!task_title?.trim()) {
    return { success: false, message: "Need a task title to find the task to update." }
  }

  // Find the task
  const task = await findTaskByTitle(task_title, ctx.founder_id)
  if (!task) {
    return {
      success: false,
      message: `Could not find an active task matching "${task_title}". Please check the task title and try again.`,
    }
  }

  // Build update object with only changed fields
  const updateData: Record<string, any> = {}
  const changes: string[] = []

  if (new_title) {
    updateData.title = new_title
    changes.push(`Title → "${new_title}"`)
  }
  if (notes !== undefined) {
    updateData.notes = notes || null
    changes.push(`Notes updated`)
  }
  if (priority) {
    updateData.priority = priority
    changes.push(`Priority → ${priority}`)
  }
  if (status) {
    updateData.status = status
    updateData.is_completed = status === "completed"
    changes.push(`Status → ${status}`)
  }
  if (due_date) {
    updateData.due_date = new Date(due_date).toISOString()
    changes.push(`Due date → ${new Date(due_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`)
  }
  if (bucket) {
    updateData.bucket = bucket
    changes.push(`Bucket → ${bucket}`)
  }

  // Resolve assignee
  if (assigned_to_name) {
    const member = await resolveTeamMember(assigned_to_name, ctx.team, ctx.founder_id)
    if (member) {
      updateData.assigned_to = member.user_id
      changes.push(`Assigned to → ${member.full_name}`)
    } else {
      return {
        success: false,
        message: `Could not find team member "${assigned_to_name}". Available: ${ctx.team.map((m) => m.full_name).join(", ") || "none"}.`,
      }
    }
  }

  // Resolve project
  let resolvedProjectId = task.project_id
  if (project_name) {
    const project = await resolveProject(project_name, ctx.projects, ctx.founder_id)
    if (project) {
      updateData.project_id = project.id
      resolvedProjectId = project.id
      changes.push(`Project → ${project.name}`)
    } else {
      return {
        success: false,
        message: `Could not find project "${project_name}". Available: ${ctx.projects.map((p) => p.name).join(", ") || "none"}.`,
      }
    }
  }

  // Resolve vault file attachments — merge with existing
  let unmatchedFiles: string[] = []
  if (vault_file_names && vault_file_names.length > 0) {
    if (!resolvedProjectId) {
      return {
        success: false,
        message: `Cannot attach vault files — this task isn't linked to a project. Link a project first.`,
      }
    }
    const result = await resolveVaultFiles(vault_file_names, resolvedProjectId, ctx.founder_id)
    unmatchedFiles = result.unmatched

    if (result.matched.length > 0) {
      // Merge with existing vault_attachments
      const existing: VaultAttachment[] = task.vault_attachments || []
      const merged = [...existing]
      for (const newFile of result.matched) {
        if (!merged.some((m) => m.vault_item_id === newFile.vault_item_id)) {
          merged.push(newFile)
        }
      }
      updateData.vault_attachments = merged
      changes.push(`Vault files added: ${result.matched.map(v => v.title).join(", ")}`)
    }
  }

  // Process external links — merge with existing
  if (external_links && external_links.length > 0) {
    const newResources = external_links.map((link: { url: string; label?: string }) => ({
      url: link.url,
      title: generateLinkLabel(link.url, link.label),
    }))
    const existing: Array<{ url: string; title?: string }> = task.resources || []
    const merged = [...existing]
    for (const nr of newResources) {
      if (!merged.some((m) => m.url === nr.url)) {
        merged.push(nr)
      }
    }
    updateData.resources = merged
    changes.push(`Links added: ${newResources.map((r: { title: string }) => r.title).join(", ")}`)
  }

  if (Object.keys(updateData).length === 0) {
    return { success: false, message: "No changes specified. What would you like to update?" }
  }

  const { error } = await supabaseAdmin
    .from("tasks")
    .update(updateData)
    .eq("id", task.id)

  if (error) {
    console.error("[ACTION] update_task error:", error)
    return { success: false, message: `Failed to update task: ${error.message}` }
  }

  // Build message with unmatched file warnings
  let message = `Task "${task.title}" updated.`
  if (unmatchedFiles.length > 0) {
    message += ` Note: Could not find vault files matching: ${unmatchedFiles.map(f => `"${f}"`).join(", ")}.`
  }

  return {
    success: true,
    message,
    data: {
      task_id: task.id,
      original_title: task.title,
      changes,
      unmatched_files: unmatchedFiles,
    },
  }
}

// ── DELETE TASK ──────────────────────────────────────────────────────────────

async function executeDeleteTask(
  args: Record<string, any>,
  ctx: ActionContext
): Promise<ActionResult> {
  const { task_title } = args

  if (!task_title?.trim()) {
    return { success: false, message: "Need a task title to find the task to delete." }
  }

  const task = await findTaskByTitle(task_title, ctx.founder_id)
  if (!task) {
    return {
      success: false,
      message: `Could not find an active task matching "${task_title}".`,
    }
  }

  // Always return needs_confirmation — the frontend will show a confirm button
  return {
    success: true,
    needs_confirmation: true,
    message: `Found task: "${task.title}". Please confirm deletion.`,
    confirmation_action: {
      tool: "delete_task_confirmed",
      args: { task_id: task.id },
      resolved_id: task.id,
      description: `Delete task "${task.title}"${task.assigned_to ? " (has assignee)" : ""}${task.due_date ? ` (due ${new Date(task.due_date).toLocaleDateString()})` : ""}`,
    },
  }
}

// Called after user confirms deletion via the frontend button
export async function executeDeleteTaskConfirmed(taskId: string): Promise<ActionResult> {
  const { error } = await supabaseAdmin
    .from("tasks")
    .delete()
    .eq("id", taskId)

  if (error) {
    console.error("[ACTION] delete_task_confirmed error:", error)
    return { success: false, message: `Failed to delete task: ${error.message}` }
  }

  return {
    success: true,
    message: "Task deleted successfully.",
    data: { task_id: taskId },
  }
}

// ── CREATE PROJECT ──────────────────────────────────────────────────────────

async function executeCreateProject(
  args: Record<string, any>,
  ctx: ActionContext
): Promise<ActionResult> {
  const { name, description, priority, status, start_date, end_date } = args

  if (!name?.trim()) {
    return { success: false, message: "Project name is required." }
  }

  const insertData = {
    founder_id: ctx.founder_id,
    name: name.trim(),
    description: description || null,
    priority: priority || "medium",
    status: status || "active",
    start_date: start_date || null,
    end_date: end_date || null,
  }

  const { data, error } = await supabaseAdmin
    .from("projects")
    .insert(insertData)
    .select("id, name")
    .single()

  if (error) {
    console.error("[ACTION] create_project error:", error)
    return { success: false, message: `Failed to create project: ${error.message}` }
  }

  return {
    success: true,
    message: `Project created successfully.`,
    data: {
      project_id: data.id,
      name: data.name,
      priority: priority || "medium",
      status: status || "active",
    },
  }
}

// ── UPDATE PROJECT ──────────────────────────────────────────────────────────

async function executeUpdateProject(
  args: Record<string, any>,
  ctx: ActionContext
): Promise<ActionResult> {
  const { project_name, new_name, description, priority, status, start_date, end_date } = args

  if (!project_name?.trim()) {
    return { success: false, message: "Need a project name to find the project to update." }
  }

  const project = await findProjectByName(project_name, ctx.founder_id)
  if (!project) {
    return {
      success: false,
      message: `Could not find project "${project_name}". Available: ${ctx.projects.map((p) => p.name).join(", ") || "none"}.`,
    }
  }

  const updateData: Record<string, any> = {}
  const changes: string[] = []

  if (new_name) {
    updateData.name = new_name
    changes.push(`Name → "${new_name}"`)
  }
  if (description !== undefined) {
    updateData.description = description || null
    changes.push(`Description updated`)
  }
  if (priority) {
    updateData.priority = priority
    changes.push(`Priority → ${priority}`)
  }
  if (status) {
    updateData.status = status
    changes.push(`Status → ${status}`)
  }
  if (start_date) {
    updateData.start_date = start_date
    changes.push(`Start date → ${start_date}`)
  }
  if (end_date) {
    updateData.end_date = end_date
    changes.push(`End date → ${end_date}`)
  }

  if (Object.keys(updateData).length === 0) {
    return { success: false, message: "No changes specified. What would you like to update?" }
  }

  const { error } = await supabaseAdmin
    .from("projects")
    .update(updateData)
    .eq("id", project.id)

  if (error) {
    console.error("[ACTION] update_project error:", error)
    return { success: false, message: `Failed to update project: ${error.message}` }
  }

  return {
    success: true,
    message: `Project "${project.name}" updated.`,
    data: {
      project_id: project.id,
      original_name: project.name,
      changes,
    },
  }
}
