// AI Performance Logger - Centralized logging for AI operations
// Provides structured logging with timing, cache metrics, and request tracing

export interface LogContext {
  requestId: string
  userId?: string
  founderId?: string
  step?: number
}

export interface TimingMetric {
  name: string
  duration: number
  metadata?: Record<string, any>
}

const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"

// Color codes for terminal
const COLORS = {
  // Timing phases
  request: "\x1b[36m",    // Cyan
  llm: "\x1b[35m",        // Magenta
  cache: "\x1b[33m",       // Yellow
  db: "\x1b[34m",         // Blue
  tool: "\x1b[32m",       // Green
  action: "\x1b[31m",     // Red
  stream: "\x1b[96m",     // Bright cyan
  error: "\x1b[91m",      // Bright red
  warn: "\x1b[93m",       // Bright yellow
  success: "\x1b[92m",    // Bright green
}

function colorize(color: string, text: string): string {
  return `${color}${text}${RESET}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// Generate unique request ID
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// Performance tracker for a single request
export class AIPerformanceTracker {
  private requestId: string
  private startTime: number
  private timings: TimingMetric[] = []
  private cacheHits: Map<string, boolean> = new Map()
  private cacheMisses: Map<string, boolean> = new Map()
  private toolCalls: Array<{ name: string; duration: number; cached: boolean }> = []

  constructor(requestId: string) {
    this.requestId = requestId
    this.startTime = performance.now()
  }

  // Mark a timing point
  mark(name: string, metadata?: Record<string, any>): number {
    const duration = performance.now() - this.startTime
    this.timings.push({ name, duration, metadata })
    
    const icon = this.getIconForPhase(name)
    console.log(
      `${colorize(COLORS.request, `[${this.requestId}]`)} ` +
      `${colorize(COLORS.request, "▸")} ` +
      `${colorize(COLORS.request, BOLD + name)} ` +
      `${colorize(COLORS.request, DIM)}(${formatDuration(duration)})`
    )
    
    return duration
  }

  private getIconForPhase(name: string): string {
    if (name.includes("cache") || name.includes("Cache")) return "💾"
    if (name.includes("LLM") || name.includes("llm") || name.includes("Groq")) return "🤖"
    if (name.includes("tool") || name.includes("Tool")) return "🔧"
    if (name.includes("db") || name.includes("DB") || name.includes("Supabase")) return "🗄️"
    if (name.includes("action") || name.includes("Action")) return "⚡"
    if (name.includes("stream") || name.includes("Stream")) return "📡"
    if (name.includes("error") || name.includes("Error")) return "❌"
    return "→"
  }

  // Log cache hit
  logCacheHit(key: string, source: "redis" | "memory" = "redis"): void {
    this.cacheHits.set(key, true)
    console.log(
      `${colorize(COLORS.request, `[${this.requestId}]`)} ` +
      `${colorize(COLORS.cache, "💾 CACHE HIT  ")} ` +
      `${colorize(COLORS.cache, DIM + key)} ` +
      `${colorize(COLORS.cache, `(${source})`)}`
    )
  }

  // Log cache miss
  logCacheMiss(key: string): void {
    this.cacheMisses.set(key, true)
    console.log(
      `${colorize(COLORS.request, `[${this.requestId}]`)} ` +
      `${colorize(COLORS.cache, "💾 CACHE MISS ")} ` +
      `${colorize(COLORS.cache, DIM + key)}`
    )
  }

  // Log cache write
  logCacheWrite(key: string, ttl: number, dataSize?: number): void {
    console.log(
      `${colorize(COLORS.request, `[${this.requestId}]`)} ` +
      `${colorize(COLORS.cache, "💾 CACHE WRITE")} ` +
      `${colorize(COLORS.cache, DIM + key)} ` +
      `${colorize(COLORS.cache, `TTL:${ttl}s`)}` +
      (dataSize ? ` ${colorize(COLORS.cache, `Size:${formatBytes(dataSize)}`)}` : "")
    )
  }

  // Log tool call
  logToolCall(toolName: string, duration: number, cached: boolean = false): void {
    this.toolCalls.push({ name: toolName, duration, cached })
    const status = cached 
      ? colorize(COLORS.cache, "MEMO")
      : colorize(COLORS.tool, "EXEC")
    
    console.log(
      `${colorize(COLORS.request, `[${this.requestId}]`)} ` +
      `${colorize(COLORS.tool, "🔧 TOOL CALL ")} ` +
      `${status} ` +
      `${colorize(COLORS.tool, toolName)} ` +
      `${colorize(COLORS.tool, DIM)}(${formatDuration(duration)})`
    )
  }

  // Log LLM call
  logLLMCall(model: string, inputTokens: number, outputTokens: number, duration: number): void {
    console.log(
      `${colorize(COLORS.request, `[${this.requestId}]`)} ` +
      `${colorize(COLORS.llm, "🤖 LLM CALL   ")} ` +
      `${colorize(COLORS.llm, model)} ` +
      `${colorize(COLORS.llm, DIM + `In:${inputTokens} Out:${outputTokens}`)} ` +
      `${colorize(COLORS.llm, formatDuration(duration))}`
    )
  }

  // Log what's being sent to LLM (truncated for readability)
  logLLMInput(messages: any[], tools: any[]): void {
    const msgCount = messages.length
    const toolCount = tools?.length || 0
    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0)
    
    console.log(
      `${colorize(COLORS.request, `[${this.requestId}]`)} ` +
      `${colorize(COLORS.llm, "📤 POURING   ")} ` +
      `${colorize(COLORS.llm, `${msgCount} messages`)} ` +
      `${colorize(COLORS.llm, DIM + `| ${toolCount} tools`)} ` +
      `${colorize(COLORS.llm, DIM + `| ${formatBytes(totalChars)}`)}`
    )
    
    // Log system prompt summary
    const systemMsg = messages.find(m => m.role === "system")
    if (systemMsg?.content) {
      const preview = systemMsg.content.slice(0, 200).replace(/\n/g, " ")
      console.log(
        `${colorize(COLORS.request, `[${this.requestId}]`)} ` +
        `${colorize(COLORS.llm, DIM + "   System: " + preview + "...")}`
      )
    }
  }

  // Log streaming output
  logStreamChunk(chunkLength: number, totalSoFar: number): void {
    // Only log every ~500ms worth of chunks to avoid spam
    if (totalSoFar % 10 === 0) {
      process.stdout.write(
        `${colorize(COLORS.stream, "📡")}`
      )
    }
  }

  logStreamEnd(totalChars: number, totalChunks: number): void {
    console.log("")
    console.log(
      `${colorize(COLORS.request, `[${this.requestId}]`)} ` +
      `${colorize(COLORS.stream, "📡 STREAM END")} ` +
      `${colorize(COLORS.stream, `${totalChars} chars`)} ` +
      `${colorize(COLORS.stream, DIM + `| ${totalChunks} chunks`)}`
    )
  }

  // Log action execution
  logAction(action: string, result: "success" | "error" | "pending", details?: string): void {
    const statusIcon = result === "success" ? "✅" : result === "error" ? "❌" : "⏳"
    const color = result === "success" ? COLORS.success : result === "error" ? COLORS.error : COLORS.warn
    
    console.log(
      `${colorize(COLORS.request, `[${this.requestId}]`)} ` +
      `${colorize(COLORS.action, `⚡ ACTION    `)} ` +
      `${colorize(action, statusIcon + " " + action)} ` +
      (details ? colorize(COLORS.action, DIM + details) : "")
    )
  }

  // Log error
  logError(context: string, error: any): void {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.log(
      `${colorize(COLORS.request, `[${this.requestId}]`)} ` +
      `${colorize(COLORS.error, "❌ ERROR     ")} ` +
      `${colorize(COLORS.error, context)}: ` +
      `${colorize(COLORS.error, errorMsg)}`
    )
  }

  // Print summary at end
  printSummary(): void {
    const totalDuration = performance.now() - this.startTime
    
    console.log("")
    console.log(colorize(COLORS.request, BOLD + "═".repeat(60)))
    console.log(
      `${colorize(COLORS.request, "[${this.requestId}]")} ` +
      colorize(COLORS.request, BOLD + "PERFORMANCE SUMMARY")
    )
    console.log(colorize(COLORS.request, "═".repeat(60)))
    
    // Total time
    console.log(
      `  ${colorize(COLORS.request, "Total Duration:")} ${colorize(COLORS.success, formatDuration(totalDuration))}`
    )
    
    // Phase timings
    if (this.timings.length > 0) {
      console.log(`\n  ${colorize(COLORS.request, BOLD + "Phase Timings:")}`)
      for (const timing of this.timings) {
        const percentage = ((timing.duration / totalDuration) * 100).toFixed(1)
        console.log(
          `    ${colorize(COLORS.tool, timing.name.padEnd(25))} ` +
          `${formatDuration(timing.duration).padStart(10)} ` +
          `${colorize(COLORS.request, DIM + `(${percentage}%)`)}`
        )
      }
    }
    
    // Cache stats
    const totalCacheOps = this.cacheHits.size + this.cacheMisses.size
    if (totalCacheOps > 0) {
      const hitRate = ((this.cacheHits.size / totalCacheOps) * 100).toFixed(1)
      console.log(
        `\n  ${colorize(COLORS.cache, BOLD + "Cache Stats:")}`
      )
      console.log(
        `    ${colorize(COLORS.cache, "Hits:   ")} ${colorize(COLORS.success, String(this.cacheHits.size).padStart(4))} ` +
        `${colorize(COLORS.cache, "Misses: ")} ${colorize(COLORS.warn, String(this.cacheMisses.size).padStart(4))} ` +
        `${colorize(COLORS.cache, "Hit Rate: ")} ${colorize(
          parseFloat(hitRate) >= 80 ? COLORS.success : parseFloat(hitRate) >= 50 ? COLORS.warn : COLORS.error,
          `${hitRate}%`
        )}`
      )
    }
    
    // Tool calls
    if (this.toolCalls.length > 0) {
      const totalToolTime = this.toolCalls.reduce((sum, t) => sum + t.duration, 0)
      const memoized = this.toolCalls.filter(t => t.cached).length
      console.log(
        `\n  ${colorize(COLORS.tool, BOLD + "Tool Calls:")} ${this.toolCalls.length} total ` +
        `${colorize(COLORS.tool, DIM + `(Memoized: ${memoized})`)}`
      )
      console.log(
        `    ${colorize(COLORS.tool, "Total Tool Time:")} ${formatDuration(totalToolTime)} ` +
        `${colorize(COLORS.tool, DIM + `(${(totalToolTime / totalDuration * 100).toFixed(1)}% of total)`)}`
      )
    }
    
    console.log(colorize(COLORS.request, "═".repeat(60)))
    console.log("")
  }
}

// Quick logging helpers for simple use cases
export const aiLogger = {
  request: (id: string, action: string) => {
    console.log(`${colorize(COLORS.request, `[${id}]`)} ${colorize(COLORS.request, action)}`)
  },
  
  llm: {
    call: (id: string, model: string) => {
      console.log(`${colorize(COLORS.llm, `[${id}] 🤖 LLM → ${model}`)}`)
    },
    input: (id: string, summary: string) => {
      console.log(`${colorize(COLORS.llm, `[${id}] 📤 ${summary}`)}`)
    },
    output: (id: string, chars: number) => {
      console.log(`${colorize(COLORS.llm, `[${id}] 📥 ${chars} chars received`)}`)
    }
  },
  
  cache: {
    hit: (id: string, key: string) => {
      console.log(`${colorize(COLORS.cache, `[${id}] 💾 HIT  → ${key}`)}`)
    },
    miss: (id: string, key: string) => {
      console.log(`${colorize(COLORS.cache, `[${id}] 💾 MISS → ${key}`)}`)
    },
    write: (id: string, key: string, ttl: number) => {
      console.log(`${colorize(COLORS.cache, `[${id}] 💾 SET  → ${key} (TTL:${ttl}s)`)}`)
    }
  },
  
  tool: {
    start: (id: string, name: string) => {
      console.log(`${colorize(COLORS.tool, `[${id}] 🔧 → ${name}`)}`)
    },
    end: (id: string, name: string, ms: number, cached: boolean) => {
      const icon = cached ? "💾" : "✅"
      console.log(`${colorize(COLORS.tool, `[${id}] ${icon} ← ${name} (${ms.toFixed(0)}ms)`)}`)
    }
  },
  
  error: (id: string, context: string, error: any) => {
    const msg = error instanceof Error ? error.message : String(error)
    console.log(`${colorize(COLORS.error, `[${id}] ❌ ${context}: ${msg}`)}`)
  }
}
