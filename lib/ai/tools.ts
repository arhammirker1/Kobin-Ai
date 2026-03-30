// ── AI Tool Definitions ─────────────────────────────────────────────────────
// Combined read + action tools for the MCP-style manager agent.

import { READ_TOOLS, type ReadToolName } from "./mcp-read-tools"

// ── Action Tools (trimmed descriptions) ──────────────────────────────────────

export const ACTION_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: `Create a task in ONE call with ALL details. Requires title. BEFORE calling this, use read tools to resolve: team member names (get_team_workload), project names (get_projects), and vault file titles (get_vault_files). ALL parameter values must be plain strings or arrays — NEVER pass objects or nested structures. STRICT FIELD NAMES: use assigned_to_name (NOT assignee), project_name (NOT project), vault_file_names (NOT vault_files), external_links (NOT links). Pass vault_file_names as exact titles from get_vault_files results. Infer due_date from natural language (ISO format). Auto-bucket: today/this-week/delegated/backlog. NEVER call this twice for the same task.`,
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title as a plain string e.g. 'Fix login bug'" },
          notes: { type: "string", description: "Additional context as a plain string" },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
            description: "A single string value from the enum e.g. 'medium'",
          },
          status: {
            type: "string",
            enum: ["todo", "in-progress", "blocked", "completed"],
            description: "A single string value from the enum e.g. 'todo'",
          },
          due_date: {
            type: "string",
            description: "Due date as plain ISO 8601 string e.g. '2026-04-01T09:00:00'",
          },
          assigned_to_name: {
            type: "string",
            description: "Team member full name as a plain string e.g. 'John Smith'",
          },
          project_name: {
            type: "string",
            description: "Project name as a plain string e.g. 'Website Redesign'",
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
            description: "Vault file titles to attach (must belong to linked project). Field name is vault_file_names, NOT vault_files.",
          },
          external_links: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string" },
                label: { type: "string", description: "Auto-generated from URL if not provided" },
              },
              required: ["url", "label"],
            },
            description: "External links to attach. Field name is external_links, NOT links.",
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
  {
    type: "function" as const,
    function: {
      name: "draft_email_reply",
      description: `Draft an email reply to a CRM contact. Looks up their latest email thread and generates a contextual reply. Returns the draft text — user can review and send. ALWAYS use search_contacts first to verify the contact exists and has email threads.`,
      parameters: {
        type: "object",
        properties: {
          contact_name: { type: "string", description: "Contact name to reply to" },
          tone: {
            type: "string",
            enum: ["professional", "friendly", "urgent", "follow_up"],
            description: "Tone of the reply. Default: professional",
          },
          context: {
            type: "string",
            description: "Additional context or instructions for the reply (e.g. 'schedule a meeting', 'decline politely')",
          },
        },
        required: ["contact_name"],
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
  | "draft_email_reply"

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
  "get_follow_up_needed",
])
