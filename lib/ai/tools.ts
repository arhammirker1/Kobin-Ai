// ── AI Tool Definitions ─────────────────────────────────────────────────────
// Combined read + action tools for the MCP-style manager agent.

import { READ_TOOLS, type ReadToolName } from "./mcp-read-tools"

// ── Action Tools (trimmed descriptions) ──────────────────────────────────────

export const ACTION_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: `Create a task in ONE call with ALL details. Requires title. IMPORTANT: every parameter must be a primitive JSON value (string/boolean) or array of strings. NEVER send nested objects for fields like title/project_name/assigned_to_name/deliverable_required. BEFORE calling this, use read tools to resolve: team member names (get_team_workload), project names (get_projects), and vault file titles (get_vault_files). Pass vault_file_names as exact titles from get_vault_files results. Infer due_date from natural language (ISO format). Auto-bucket: today/this-week/delegated/backlog. NEVER call this twice for the same task.`,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", description: "Task title" },
          notes: { type: "string", description: "Additional context" },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
            description: "Default: medium",
          },
          status: {
            type: "string",
            enum: ["todo", "in-progress", "blocked", "completed"],
            description: "Default: todo",
          },
          due_date: {
            type: "string",
            description: "Due date in ISO 8601 (YYYY-MM-DDTHH:mm:ss)",
          },
          assigned_to_name: {
            type: "string",
            description: "Team member name to assign to",
          },
          project_name: {
            type: "string",
            description: "Project name to link to",
          },
          bucket: {
            type: "string",
            enum: ["today", "this-week", "delegated", "backlog"],
            description: "Auto-determined if not set",
          },
          deliverable_required: {
            type: "boolean",
            description: "Require deliverable upload on completion",
          },
          deliverable_description: {
            type: "string",
            description: "What to submit as deliverable",
          },
          vault_file_names: {
            type: "array",
            items: { type: "string" },
            description: "Vault file titles to attach (must belong to linked project)",
          },
          external_links: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string" },
                label: { type: "string", description: "Auto-generated from URL if not provided" },
              },
              additionalProperties: false,
              required: ["url"],
            },
            description: "External links to attach",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_task",
      description: `Update an existing task by title (fuzzy match). Only include fields to change. IMPORTANT: use primitive JSON values only (no nested object wrappers for scalar fields). Same name resolution as create_task.`,
      parameters: {
        type: "object",
        additionalProperties: false,
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
              additionalProperties: false,
              required: ["url"],
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
          status: { type: "string", enum: ["active", "on-hold", "completed", "archived"] },
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
          status: { type: "string", enum: ["active", "on-hold", "completed", "archived"] },
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
