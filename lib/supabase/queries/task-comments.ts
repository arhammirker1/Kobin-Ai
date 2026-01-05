import { createClient } from "@/lib/supabase/client"

export interface TaskComment {
  id: string
  task_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
  profile?: {
    full_name: string
    avatar_url?: string
  }
}

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from("task_comments")
    .select(`
      *,
      profile:profiles(full_name, avatar_url)
    `)
    .eq("task_id", taskId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[v0] Error fetching task comments:", error)
    throw error
  }

  return data || []
}

export async function createTaskComment(taskId: string, content: string) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("User not authenticated")
  }

  const { data, error } = await supabase
    .from("task_comments")
    .insert({
      task_id: taskId,
      user_id: user.id,
      content,
    })
    .select(`
      *,
      profile:profiles(full_name, avatar_url)
    `)
    .single()

  if (error) {
    console.error("[v0] Error creating comment:", error)
    throw error
  }

  return data
}

export async function deleteTaskComment(commentId: string) {
  const supabase = createClient()

  const { error } = await supabase.from("task_comments").delete().eq("id", commentId)

  if (error) {
    console.error("[v0] Error deleting comment:", error)
    throw error
  }
}

export async function getTaskCommentCount(taskId: string): Promise<number> {
  const supabase = createClient()

  const { count, error } = await supabase
    .from("task_comments")
    .select("*", { count: "exact", head: true })
    .eq("task_id", taskId)

  if (error) {
    console.error("[v0] Error fetching comment count:", error)
    return 0
  }

  return count || 0
}
