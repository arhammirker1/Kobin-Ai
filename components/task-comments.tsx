"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Trash2, Send } from "lucide-react"
import { toast } from "react-hot-toast"
import {
  createTaskComment,
  deleteTaskComment,
  getTaskComments,
  type TaskComment,
} from "@/lib/supabase/queries/task-comments"
import { format } from "date-fns"
import { createClient } from "@/lib/supabase/client"

interface TaskCommentsProps {
  taskId: string
  onCommentCountChange?: (count: number) => void
}

export function TaskComments({ taskId, onCommentCountChange }: TaskCommentsProps) {
  const [comments, setComments] = useState<TaskComment[]>([])
  const [newComment, setNewComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    loadComments()
    getCurrentUser()
  }, [taskId])

  const getCurrentUser = async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      setCurrentUserId(user.id)
    }
  }

  const loadComments = async () => {
    try {
      const data = await getTaskComments(taskId)
      setComments(data)
      onCommentCountChange?.(data.length)
    } catch (error) {
      console.error("[v0] Error loading comments:", error)
    }
  }

  const handleSubmit = async () => {
    if (!newComment.trim()) {
      toast.error("Please enter a comment")
      return
    }

    setIsSubmitting(true)
    try {
      await createTaskComment(taskId, newComment.trim())
      setNewComment("")
      await loadComments()
      toast.success("Comment added")
    } catch (error) {
      console.error("[v0] Error creating comment:", error)
      toast.error("Failed to add comment")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (commentId: string) => {
    try {
      await deleteTaskComment(commentId)
      await loadComments()
      toast.success("Comment deleted")
    } catch (error) {
      console.error("[v0] Error deleting comment:", error)
      toast.error("Failed to delete comment")
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <ScrollArea className="flex-1 pr-4">
        <div className="space-y-4">
          {comments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No comments yet. Be the first to comment!
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex gap-3 group">
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {getInitials(comment.profile?.full_name || "User")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{comment.profile?.full_name || "User"}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(comment.created_at), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{comment.content}</p>
                </div>
                {currentUserId === comment.user_id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => handleDelete(comment.id)}
                    title="Delete comment"
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="flex gap-2 pt-4 border-t">
        <Input
          placeholder="Add a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          disabled={isSubmitting}
          className="flex-1"
        />
        <Button onClick={handleSubmit} disabled={isSubmitting || !newComment.trim()} size="icon" className="shrink-0">
          <Send size={16} />
        </Button>
      </div>
    </div>
  )
}
