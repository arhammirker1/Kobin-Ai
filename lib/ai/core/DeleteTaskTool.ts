import { z } from "zod"
import { BaseTool } from "./BaseTool"
import type { ActionContext, ActionResult } from "../action-executor"
import { supabaseAdmin } from "@/lib/supabase/admin"

const InputSchema = z.object({
  task_title: z.string().describe("Task title to find (fuzzy match)"),
  needs_confirmation: z.boolean().optional().default(true).describe("Must resolve to true.")
})

export class DeleteTaskTool extends BaseTool<typeof InputSchema> {
  public readonly name = "delete_task"
  public readonly description = "Delete a task by title. Always set needs_confirmation=true."
  public readonly inputSchema = InputSchema

  public async execute(input: z.infer<typeof InputSchema>, context: ActionContext): Promise<ActionResult> {
    const { task_title } = input
    const founderId = context.founder_id

    // Find the task (using exact or contains match)
    const { data: task } = await supabaseAdmin
      .from("tasks")
      .select("id, title")
      .eq("user_id", founderId)
      .ilike("title", `%${task_title}%`)
      .limit(1)
      .single()

    if (!task) {
      return { success: false, message: `Could not find task matching "${task_title}".` }
    }

    const { error } = await supabaseAdmin
      .from("tasks")
      .delete()
      .eq("id", task.id)

    if (error) {
      return { success: false, message: `Failed to delete task: ${error.message}` }
    }

    return {
      success: true,
      message: `Task "${task.title}" deleted successfully.`,
      data: {
        task_id: task.id
      }
    }
  }
}
