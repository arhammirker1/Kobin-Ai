import { z } from "zod"
import { WorkspaceOverviewTool } from "./WorkspaceOverviewTool"
import { CreateTaskTool } from "./CreateTaskTool"
import { UpdateTaskTool } from "./UpdateTaskTool"
import { DeleteTaskTool } from "./DeleteTaskTool"
import { GenericReadTool } from "./GenericReadTool"

export const REGISTERED_TOOLS = [
  new WorkspaceOverviewTool(),
  new CreateTaskTool(),
  new UpdateTaskTool(),
  new DeleteTaskTool(),
  
  // Wrapped Read Tools
  new GenericReadTool(
    "get_tasks",
    "Fetch tasks with optional filters (all_active, overdue, blocked, due_today, due_this_week, completed_recent).",
    z.object({
      filter: z.enum(["all_active", "overdue", "blocked", "due_today", "due_this_week", "completed_recent"]).optional(),
      project_name: z.string().optional(),
      assigned_to_name: z.string().optional(),
      limit: z.number().optional()
    })
  ),
  new GenericReadTool(
    "get_projects",
    "Fetch projects with task counts. Filter by status (active, on-hold, completed, archived).",
    z.object({
      status: z.enum(["active", "on-hold", "completed", "archived", "all"]).optional(),
      name: z.string().optional()
    })
  ),
  new GenericReadTool(
    "get_team_workload",
    "Get team members with workload stats. Use before assigning tasks.",
    z.object({
      name: z.string().optional()
    })
  ),
  new GenericReadTool(
    "get_crm_pipeline",
    "Fetch CRM deals grouped by pipeline stage.",
    z.object({
      stage: z.string().optional(),
      include_clients: z.boolean().optional(),
      stale_only: z.boolean().optional()
    })
  ),
  new GenericReadTool(
    "get_calendar",
    "Fetch upcoming or recent calendar events.",
    z.object({
      range: z.enum(["today", "this_week", "next_7_days", "next_14_days", "past_7_days", "past_30_days"]).optional()
    })
  ),
  new GenericReadTool(
    "get_vault_files",
    "Fetch vault files/documents. Filter by project.",
    z.object({
      project_name: z.string().optional(),
      search: z.string().optional()
    })
  ),
  new GenericReadTool(
    "get_task_creation_context",
    "Returns relevant data needed to create or update a task.",
    z.object({
      project_name: z.string().optional()
    })
  ),
  new GenericReadTool(
    "search_contacts",
    "Look up a contact profile by name. Returns pipeline stage and relationship intelligence.",
    z.object({
      name: z.string()
    })
  )
]
