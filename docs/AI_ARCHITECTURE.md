# Agentic AI Architecture Documentation

This document provides a technical overview of the modernized AI architecture implemented in **Founder-Assistant**, transitioning from a monolithic loop to a stateful, modular, and permission-aware agentic framework inspired by **Claude Code**.

---

## 🏗️ High-Level Architecture

The system is now decoupled into three primary layers:

1.  **Orchestration Layer (`QueryEngine`)**: Manages the conversation lifecycle, tool-calling loops, and state persistence.
2.  **Capability Layer (`BaseTool`)**: Defines what the AI can *do*. Each tool is an independent, validated class.
3.  **Security Layer (`PermissionBroker`)**: Evaluates the safety of every tool call before execution, enabling structured Human-in-the-Loop workflows.

### Before vs. After
| Feature | Legacy Monolith | New Agentic Framework |
| :--- | :--- | :--- |
| **State** | Stateless (full history sent every time) | **Stateful** (Redis-backed ephemeral memory) |
| **Tool Validation** | Manual "repair" logic in API route | **Zod-validated** schemas in `BaseTool` |
| **Security** | Simple boolean flags | **Speculative Permissions** (SAFE/SENSITIVE/DANGEROUS) |
| **Reasoning** | Single-pass tool usage | **Multi-turn reasoning** (agent can loop until task done) |

---

## 🧠 Core Components

### 1. `QueryEngine.ts`
The brain of the system. It uses an internal loop to:
- Generate a plan based on user input.
- Execute one or more tools sequentially.
- Observe the results and decide if more steps are needed.
- Persist the "transcript" of the thoughts/actions in **Upstash Redis**.

### 2. `BaseTool.ts`
The base class for all capabilities.
- **`params`**: A Zod schema defining inputs.
- **`toJson()`**: Automatically generates the JSON schema for the LLM.
- **`run()`**: The execution logic.
- **`level`**: Classification (SAFE, SENSITIVE, DANGEROUS).

### 3. `PermissionBroker.ts`
A specialized unit that intercepts tool calls.
- If a tool is `DANGEROUS` (e.g., `delete_task`), the broker emits an `action_needed` event.
- The Engine pauses execution and waits for a specific confirmation signal from the frontend.

---

## 🔄 Data Flow: A Typical Request

1.  **User Sends Command**: "Delete my overdue tasks."
2.  **Engine Initialized**: Fetches recent history from **Redis**.
3.  **LLM Call**: Model decides to call `get_tasks(filter="overdue")`.
4.  **Read Execution**: `get_tasks` returns a list of IDs.
5.  **Multi-Step Reasoning**: Model decides to call `delete_task` for each ID.
6.  **Permission Check**: `PermissionBroker` flags `delete_task` as `DANGEROUS`.
7.  **SSE Event**: The API streams an `action_needed` event to the frontend.
8.  **User Confirms**: Frontend shows a confirm dialog and hits the `DELETE` endpoint.
9.  **Execution Finalized**: Task is deleted; engine completes the loop.

---

## 🛠️ Developer Guide: Adding a New Tool

To add a new capability to the AI:

1.  **Create a Class**: Extend `BaseTool` in `lib/ai/core/`.
```typescript
import { BaseTool, PermissionLevel } from "./BaseTool"
import { z } from "zod"

export class MyNewTool extends BaseTool {
  name = "my_tool";
  description = "Does something cool";
  params = z.object({ arg: z.string() });
  level = PermissionLevel.SAFE;

  async run(args: any, ctx: ActionContext) {
    // Implement logic here
    return "Done!";
  }
}
```

2.  **Register it**: Add an instance to `REGISTERED_TOOLS` in `lib/ai/core/RegisterTools.ts`.

---

## ⚙️ Environment Configuration

| Variable | Description |
| :--- | :--- |
| `UPSTASH_REDIS_REST_URL` | URL for state persistence. |
| `UPSTASH_REDIS_REST_TOKEN` | Auth token for Redis. |
| `GROQ_MODEL_STRONG` | Orchestrator (Recommend: `gpt-oss-120b`). |
| `GROQ_MODEL_FAST` | Token-saving status updates (Recommend: `qwen-3-32b`). |

---

> [!TIP]
> **Performance Optimization**: The current architecture uses `GenericReadTool` as a wrapper for legacy functions. For maximum performance and better typing, migrate these into dedicated `BaseTool` classes over time.
