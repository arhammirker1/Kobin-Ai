import { z } from "zod"
import { BaseTool } from "./BaseTool"
import type { ActionContext } from "../action-executor"
import { executeReadTool } from "../mcp-read-tools"
import type { ReadToolName } from "../mcp-read-tools"

const GenericSchema = z.record(z.any())

export class GenericReadTool extends BaseTool<z.ZodTypeAny> {
  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly inputSchema: z.ZodTypeAny = GenericSchema
  ) {
    super()
  }

  public async execute(input: any, context: ActionContext) {
    // executeReadTool takes (name, args, founderId)
    return await executeReadTool(
      this.name as ReadToolName,
      input,
      context.founder_id
    )
  }
}
