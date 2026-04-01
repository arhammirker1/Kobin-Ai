// ── Action Executor Helpers ──────────────────────────────────────────────────
// This file now primarily contains shared resolution helpers and the 
// confirmed-action logic used by the agentic tool framework.

import { supabaseAdmin } from "@/lib/supabase/admin"

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
  user_id: string
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

export interface VaultAttachment {
  vault_item_id: string
  title: string
  drive_file_url: string | null
  link_url: string | null
}

// ── Fuzzy name matching ─────────────────────────────────────────────────────

export function fuzzyMatch(query: string, candidates: string[]): { match: string; index: number } | null {
  const q = query.toLowerCase().trim()
  if (!q) return null

  const exactIdx = candidates.findIndex((c) => c.toLowerCase() === q)
  if (exactIdx !== -1) return { match: candidates[exactIdx], index: exactIdx }

  const startsIdx = candidates.findIndex((c) => c.toLowerCase().startsWith(q))
  if (startsIdx !== -1) return { match: candidates[startsIdx], index: startsIdx }

  const containsIdx = candidates.findIndex((c) => c.toLowerCase().includes(q))
  if (containsIdx !== -1) return { match: candidates[containsIdx], index: containsIdx }

  const firstNameIdx = candidates.findIndex((c) => {
    const firstName = c.split(" ")[0]?.toLowerCase()
    return firstName === q || firstName?.startsWith(q)
  })
  if (firstNameIdx !== -1) return { match: candidates[firstNameIdx], index: firstNameIdx }

  return null
}

// ── Smart bucket from due_date ──────────────────────────────────────────────

export function smartBucket(dueDate: string | undefined, hasAssignee: boolean): string {
  if (!dueDate) return hasAssignee ? "delegated" : "backlog"

  const due = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endOfToday = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)

  const dayOfWeek = today.getDay()
  const endOfWeek = new Date(today.getTime() + (7 - dayOfWeek) * 24 * 60 * 60 * 1000 - 1)

  if (due <= endOfToday) return "today"
  if (due <= endOfWeek) return "this-week"
  if (hasAssignee) return "delegated"
  return "backlog"
}

// ── Resolve team member name → user_id ──────────────────────────────────────

export async function resolveTeamMember(
  name: string,
  team: TeamMemberContext[],
  founderId: string
): Promise<TeamMemberContext | null> {
  if (!name) return null

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

// ── Resolve project name → project_id ───────────────────────────────────────

export async function resolveProject(
  name: string,
  projects: ProjectContext[],
  founderId: string
): Promise<ProjectContext | null> {
  if (!name) return null
  const normalizedName = name.replace(/^project\s+/i, "").trim()

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
  const result = fuzzyMatch(normalizedName || name, names)
  if (result) return projects[result.index]
  return null
}

// ── Resolve vault files by fuzzy title match ────────────────────────────────

export async function resolveVaultFiles(
  fileNames: string[],
  projectId: string,
  founderId: string
): Promise<{ matched: VaultAttachment[]; unmatched: string[] }> {
  if (!fileNames || fileNames.length === 0 || !projectId) {
    return { matched: [], unmatched: fileNames || [] }
  }

  const { data: folders } = await supabaseAdmin
    .from("vault_folders")
    .select("id")
    .eq("project_id", projectId)
    .eq("founder_id", founderId)

  if (!folders || folders.length === 0) {
    return { matched: [], unmatched: fileNames }
  }

  const folderIds = folders.map((f) => f.id)

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

// ── Utilities ───────────────────────────────────────────────────────────────

export function generateLinkLabel(url: string, providedLabel?: string): string {
  if (providedLabel?.trim()) return providedLabel.trim()
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "")
    const domainLabels: Record<string, string> = {
      "figma.com": "Figma Design",
      "docs.google.com": "Google Doc",
      "github.com": "GitHub Link",
      "notion.so": "Notion Page",
      "slack.com": "Slack",
      "loom.com": "Loom Video",
    }
    for (const [key, label] of Object.entries(domainLabels)) {
      if (domain === key || domain.endsWith(`.${key}`)) return label
    }
    const domainName = domain.split(".")[0]
    return domainName.charAt(0).toUpperCase() + domainName.slice(1) + " Link"
  } catch {
    return "External Link"
  }
}

export function normalizeEnumValue(value: any, allowed: string[], fallback: string): string {
  if (typeof value !== "string") return fallback
  const v = value.toLowerCase().trim()
  return allowed.includes(v) ? v : fallback
}

export function parseBooleanLike(value: any, fallback = false): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const v = value.toLowerCase().trim()
    if (v === "true") return true
    if (v === "false") return false
  }
  return fallback
}

export function parseIsoDateSafe(value: any): string | null {
  if (!value || typeof value !== "string") return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ── Confirmed Delete Logic (Used by SSE Endpoint) ──────────────────────────

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
