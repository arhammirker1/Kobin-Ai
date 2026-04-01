import type { ActionContext } from "../action-executor"
import type { BaseTool } from "./BaseTool"

export type PermissionLevel = "SAFE" | "SENSITIVE" | "DANGEROUS"

export interface PermissionDecision {
  allowed: boolean
  level: PermissionLevel
  reason?: string
  requiresConfirmation?: boolean
}

export class PermissionBroker {
  /**
   * Determine the permission level of a tool call.
   */
  public async decide(
    tool: BaseTool,
    input: any,
    context: ActionContext
  ): Promise<PermissionDecision> {
    const name = tool.name
    
    // 1. SAFE: Read-only tools
    if (name.startsWith("get_") || name.startsWith("search_")) {
      return { 
        allowed: true, 
        level: "SAFE",
        requiresConfirmation: false 
      }
    }

    // 2. DANGEROUS: Deletions or high-impact changes
    if (name.includes("delete")) {
      return {
        allowed: false,
        level: "DANGEROUS",
        reason: "Critical destructive action",
        requiresConfirmation: true
      }
    }

    // 3. SENSITIVE: Mutations like create/update
    return {
      allowed: false,
      level: "SENSITIVE",
      reason: "Workspace modification",
      requiresConfirmation: true
    }
  }
}
