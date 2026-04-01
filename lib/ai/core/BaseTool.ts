import { z } from "zod"
import type { ActionContext, ActionResult } from "../action-executor"
import type { ReadToolResult } from "../mcp-read-tools"

export type ToolResult = ActionResult | ReadToolResult

export interface ToolMetadata {
  name: string
  description: string
  parameters: z.ZodTypeAny
}

export abstract class BaseTool<T extends z.ZodTypeAny = z.ZodTypeAny> {
  public abstract readonly name: string
  public abstract readonly description: string
  public abstract readonly inputSchema: T

  /**
   * Execute the tool with validated input.
   */
  public abstract execute(
    input: z.infer<T>,
    context: ActionContext
  ): Promise<ToolResult>

  /**
   * Permission check before execution.
   * Returns true if allowed, false if needs prompt, or throws error if denied.
   */
  public async checkPermissions(
    input: z.infer<T>,
    context: ActionContext
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Default: Read-only tools (names starting with 'get_' or 'search_') are allowed.
    if (this.name.startsWith("get_") || this.name.startsWith("search_")) {
      return { allowed: true }
    }

    // Default for actions: Needs confirmation.
    return { allowed: false, reason: "Requires user confirmation" }
  }

  /**
   * Convert to OpenAI/Groq function definition format.
   */
  public toJSON() {
    return {
      type: "function" as const,
      function: {
        name: this.name,
        description: this.description,
        parameters: this.zodToJsonSchema(this.inputSchema),
      },
    }
  }

  /**
   * Simple helper to convert Zod schema to JSON schema (partial implementation).
   * In a real app, one would use a library like zod-to-json-schema.
   */
  private zodToJsonSchema(schema: z.ZodTypeAny): any {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape
      const properties: any = {}
      const required: string[] = []

      for (const [key, value] of Object.entries(shape)) {
        const isOptional = (value as any).isOptional?.() || (value as any) instanceof z.ZodOptional
        if (!isOptional) {
          required.push(key)
        }

        // Basic type mapping
        let type = "string"
        let description = (value as any).description
        let enum_values: any[] | undefined

        if (value instanceof z.ZodString) type = "string"
        if (value instanceof z.ZodNumber) type = "number"
        if (value instanceof z.ZodBoolean) type = "boolean"
        if (value instanceof z.ZodArray) type = "array"
        if (value instanceof z.ZodEnum) {
          type = "string"
          enum_values = value._def.values
        }

        properties[key] = {
          type,
          ...(description ? { description } : {}),
          ...(enum_values ? { enum: enum_values } : {}),
        }
      }

      return {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined,
        additionalProperties: false,
      }
    }
    
    if (schema instanceof z.ZodRecord) {
      return {
        type: "object",
        additionalProperties: true
      }
    }

    return { type: "object" }
  }
}
