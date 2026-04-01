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
   * Hardened helper to convert Zod schema to JSON schema.
   * Ensures strict compliance with Groq/OpenAI tool-use requirements.
   */
  private zodToJsonSchema(schema: z.ZodTypeAny): any {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape
      const properties: Record<string, any> = {}
      const required: string[] = []

      for (const [key, value] of Object.entries(shape)) {
        const unwrapped = this.unwrapZod(value as z.ZodTypeAny)
        const isOptional = (value as any).isOptional?.() || (value as any) instanceof z.ZodOptional
        
        if (!isOptional) {
          required.push(key)
        }

        properties[key] = this.convertZodType(unwrapped)
        
        // Preserve description if present
        const description = (value as any).description || (unwrapped as any).description
        if (description) {
          properties[key].description = description
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
      return { type: "object", additionalProperties: true }
    }

    return { type: "object" }
  }

  private unwrapZod(schema: z.ZodTypeAny): z.ZodTypeAny {
    let current = schema
    while (
      current instanceof z.ZodOptional ||
      current instanceof z.ZodNullable ||
      current instanceof z.ZodDefault
    ) {
      current = current._def.innerType
    }
    return current
  }

  private convertZodType(schema: z.ZodTypeAny): any {
    if (schema instanceof z.ZodString) return { type: "string" }
    if (schema instanceof z.ZodNumber) return { type: "number" }
    if (schema instanceof z.ZodBoolean) return { type: "boolean" }
    
    if (schema instanceof z.ZodEnum) {
      return { type: "string", enum: schema._def.values }
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: "array",
        items: this.convertZodType(this.unwrapZod(schema.element))
      }
    }

    if (schema instanceof z.ZodObject) {
      return this.zodToJsonSchema(schema)
    }

    return { type: "string" } // Fallback
  }
}
