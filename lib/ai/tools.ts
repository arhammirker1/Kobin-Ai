// ── AI Tool Definitions ─────────────────────────────────────────────────────
// Groq-compatible function calling schemas for the manager agent.
// The LLM uses these to decide when to call a tool vs. ask the user for info.

export const AI_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: `Create a new task in the workspace. You MUST have at minimum the task title before calling this.
If the user hasn't specified an assignee, use the workload data from context to suggest the team member with the fewest active tasks. Explain your suggestion.
If the user mentions a project name, match it against the known projects in context.
If the user mentions a team member by name, match it against the known team members in context.
For due_date, infer from natural language: "tomorrow", "next Friday", "end of week", etc. Use ISO date format.
For bucket, use smart defaults: if due_date is today → "today", this week → "this-week", has assignee but no specific date → "delegated", no date → "backlog".
Default priority is "medium" and default status is "todo" if not specified.`,
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The task title — what needs to be done",
          },
          notes: {
            type: "string",
            description: "Additional context or instructions for the task",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
            description: "Task priority level. Default: medium",
          },
          status: {
            type: "string",
            enum: ["todo", "in-progress", "blocked", "completed"],
            description: "Task status. Default: todo",
          },
          due_date: {
            type: "string",
            description:
              "Due date in ISO 8601 format (YYYY-MM-DDTHH:mm:ss). Infer from natural language like 'tomorrow', 'next Friday', 'March 15th'.",
          },
          assigned_to_name: {
            type: "string",
            description:
              "The name (or partial name) of the team member to assign to. Will be resolved against the team roster.",
          },
          project_name: {
            type: "string",
            description:
              "The name (or partial name) of the project to link this task to. Will be resolved against known projects.",
          },
          bucket: {
            type: "string",
            enum: ["today", "this-week", "delegated", "backlog"],
            description:
              "Task bucket. If not provided, auto-determined from due_date: today → 'today', this week → 'this-week', no date → 'backlog'.",
          },
          deliverable_required: {
            type: "boolean",
            description:
              "Whether the assignee must upload a deliverable when completing the task. Default: false.",
          },
          deliverable_description: {
            type: "string",
            description:
              "What the assignee should submit as a deliverable. Only relevant if deliverable_required is true.",
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
      description: `Update an existing task. You must identify the task either by its exact title or a close match. Search the active tasks list in context.
Only include the fields that the user wants to change — don't overwrite fields they didn't mention.
If the user wants to reassign, resolve the person's name from the team roster.
If the user wants to change the project, resolve the project name from context.`,
      parameters: {
        type: "object",
        properties: {
          task_title: {
            type: "string",
            description:
              "The title (or partial title) of the task to update. Used to find the task by fuzzy match.",
          },
          new_title: {
            type: "string",
            description: "New title for the task (if renaming)",
          },
          notes: {
            type: "string",
            description: "Updated notes/context",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
            description: "New priority level",
          },
          status: {
            type: "string",
            enum: ["todo", "in-progress", "blocked", "completed"],
            description: "New status",
          },
          due_date: {
            type: "string",
            description: "New due date in ISO 8601 format",
          },
          assigned_to_name: {
            type: "string",
            description: "Name of the person to reassign to",
          },
          project_name: {
            type: "string",
            description: "Name of the project to link to",
          },
          bucket: {
            type: "string",
            enum: ["today", "this-week", "delegated", "backlog"],
            description: "New bucket",
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
      description: `Delete a task. You must identify the task by its title (fuzzy match against active tasks).
IMPORTANT: Always describe which task you're about to delete and set needs_confirmation to true. The user must click a confirmation button before the actual deletion happens.`,
      parameters: {
        type: "object",
        properties: {
          task_title: {
            type: "string",
            description:
              "The title (or partial title) of the task to delete. Used to find the task by fuzzy match.",
          },
          needs_confirmation: {
            type: "boolean",
            description:
              "Must be true. The deletion requires user confirmation before executing.",
          },
        },
        required: ["task_title", "needs_confirmation"],
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "create_project",
      description: `Create a new project. You MUST have at minimum the project name.
Default priority is "medium" and default status is "active" if not specified.`,
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Project name",
          },
          description: {
            type: "string",
            description: "Project description",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
            description: "Project priority. Default: medium",
          },
          status: {
            type: "string",
            enum: ["active", "on-hold", "completed", "cancelled"],
            description: "Project status. Default: active",
          },
          start_date: {
            type: "string",
            description: "Start date in ISO format (YYYY-MM-DD)",
          },
          end_date: {
            type: "string",
            description: "End/deadline date in ISO format (YYYY-MM-DD)",
          },
        },
        required: ["name"],
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "update_project",
      description: `Update an existing project. Identify the project by name (fuzzy match against known projects).
Only include the fields the user wants to change.`,
      parameters: {
        type: "object",
        properties: {
          project_name: {
            type: "string",
            description:
              "The name (or partial name) of the project to update. Used to find by fuzzy match.",
          },
          new_name: {
            type: "string",
            description: "New project name (if renaming)",
          },
          description: {
            type: "string",
            description: "Updated description",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high", "urgent"],
            description: "New priority",
          },
          status: {
            type: "string",
            enum: ["active", "on-hold", "completed", "cancelled"],
            description: "New status",
          },
          start_date: {
            type: "string",
            description: "New start date in ISO format",
          },
          end_date: {
            type: "string",
            description: "New end date in ISO format",
          },
        },
        required: ["project_name"],
      },
    },
  },
] as const

// Type helper for tool names
export type AIToolName =
  | "create_task"
  | "update_task"
  | "delete_task"
  | "create_project"
  | "update_project"
