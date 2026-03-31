// ── AI Tool Definitions ─────────────────────────────────────────────────────
// Combined read + action tools for the MCP-style manager agent.

import { READ_TOOLS, type ReadToolName } from "./mcp-read-tools"

// ── Action Tools (trimmed descriptions) ──────────────────────────────────────

export const ACTION_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: `Create a new task. EXACT parameter names are MANDATORY — do NOT invent aliases.
REQUIRED: title (string) — the task name/title. NEVER use "task_name", "name", "task_title" — ONLY "title".
OPTIONAL parameters (use EXACT names):
- notes (string): extra context. NEVER use "description" or "details" — ONLY "notes".
- priority (string enum): "low" | "medium" | "high" | "urgent". Default: "medium".
- status (string enum): "todo" | "in-progress" | "blocked" | "completed". Default: "todo".
- due_date (string): ISO 8601 format "YYYY-MM-DDTHH:mm:ss". Infer from natural language.
- assigned_to_name (string): team member's name. NEVER use "assignee" or "assigned_to" — ONLY "assigned_to_name".
- project_name (string): project name to link to. NEVER use "project" — ONLY "project_name".
- bucket (string enum): "today" | "this-week" | "delegated" | "backlog". Auto-determined from due_date if omitted.
- deliverable_required (boolean): true if assignee must submit a file on completion.
- deliverable_description (string): what they should submit. NEVER use "deliverable" alone — ONLY "deliverable_description".
- vault_file_names (array of strings): exact vault file titles to attach (from get_vault_files results).
- external_links (array): [{url: string, label: string}] — external URLs to attach.
RULES: Call ONCE per task. Use read tools first to resolve team member names and project names.`,
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "The task title. REQUIRED. Use ONLY 'title', never 'task_name' or 'name'." },
          notes: { type: "string", description: "Additional context or description. Use ONLY 'notes', never 'description'." },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
            description: "Task priority. Must be exactly one of: low, medium, high, urgent. Default: medium.",
          },
          status: {
            type: "string",
            enum: ["todo", "in-progress", "blocked", "completed"],
            description: "Task status. Must be exactly one of: todo, in-progress, blocked, completed. Default: todo.",
          },
          due_date: {
            type: "string",
            description: "Due date in ISO 8601 format: YYYY-MM-DDTHH:mm:ss. Example: 2025-04-15T09:00:00",
          },
          assigned_to_name: {
            type: "string",
            description: "Full or first name of team member to assign to. Use ONLY 'assigned_to_name', never 'assignee'.",
          },
          project_name: {
            type: "string",
            description: "Project name to link this task to. Use ONLY 'project_name', never 'project'.",
          },
          bucket: {
            type: "string",
            enum: ["today", "this-week", "delegated", "backlog"],
            description: "Task bucket. Auto-set from due_date if omitted: today/this-week/delegated/backlog.",
          },
          deliverable_required: {
            type: "boolean",
            description: "Set true if assignee must upload a deliverable file when completing. Must be boolean true/false.",
          },
          deliverable_description: {
            type: "string",
            description: "What the assignee should submit as deliverable. Use ONLY 'deliverable_description', never 'deliverable'.",
          },
          vault_file_names: {
            type: "array",
            items: { type: "string" },
            description: "Exact vault file titles to attach. Get these from get_vault_files first.",
          },
          external_links: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string" },
                label: { type: "string" },
              },
              required: ["url", "label"],
            },
            description: "External URLs to attach. Each item must have 'url' and 'label'.",
          },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_task",
      description: `Update an existing task by title (fuzzy match). Only include fields to change. Same name resolution as create_task.`,
      parameters: {
        type: "object",
        properties: {
          task_title: { type: "string", description: "Task title to find (fuzzy match)" },
          new_title: { type: "string", description: "New title if renaming" },
          notes: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          status: { type: "string", enum: ["todo", "in-progress", "blocked", "completed"] },
          due_date: { type: "string", description: "ISO 8601 format" },
          assigned_to_name: { type: "string" },
          project_name: { type: "string" },
          bucket: { type: "string", enum: ["today", "this-week", "delegated", "backlog"] },
          vault_file_names: {
            type: "array",
            items: { type: "string" },
            description: "Vault files to attach (project vault only)",
          },
          external_links: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string" },
                label: { type: "string" },
              },
              required: ["url", "label"],
            },
          },
        },
        required: ["task_title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_task",
      description: `Delete a task by title (fuzzy match). Always set needs_confirmation=true.`,
      parameters: {
        type: "object",
        properties: {
          task_title: { type: "string", description: "Task title to find" },
          needs_confirmation: { type: "boolean", description: "Must be true" },
        },
        required: ["task_title", "needs_confirmation"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_project",
      description: `Create a project. Requires name. Default priority: medium, status: active.`,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Project name" },
          description: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          status: { type: "string", enum: ["active", "on-hold", "completed", "cancelled"] },
          start_date: { type: "string", description: "ISO date (YYYY-MM-DD)" },
          end_date: { type: "string", description: "ISO date (YYYY-MM-DD)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_project",
      description: `Update a project by name (fuzzy match). Only include fields to change.`,
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Project name to find" },
          new_name: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          status: { type: "string", enum: ["active", "on-hold", "completed", "cancelled"] },
          start_date: { type: "string" },
          end_date: { type: "string" },
        },
        required: ["project_name"],
      },
    },
  },
] as const

// ── Combined tools ──────────────────────────────────────────────────────────

export const ALL_TOOLS = [...READ_TOOLS, ...ACTION_TOOLS]

// ── Type helpers ────────────────────────────────────────────────────────────

export type AIToolName =
  | "create_task"
  | "update_task"
  | "delete_task"
  | "create_project"
  | "update_project"

export type AnyToolName = ReadToolName | AIToolName

export const READ_TOOL_NAMES = new Set<string>([
  "get_workspace_overview",
  "get_tasks",
  "get_projects",
  "get_team_workload",
  "get_crm_pipeline",
  "get_calendar",
  "get_vault_files",
  "search_contacts",
])
