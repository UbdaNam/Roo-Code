# Architecture Notes - Intent-Driven Traceability (ATS)

## 1. The Nervous System: Tool Loop

The extension's core loop resides in `src/core/task/Task.ts`. When an AI response is received, it is processed block-by-block in `src/core/assistant-message/presentAssistantMessage.ts`.

- **Dispatcher**: `presentAssistantMessage` in `src/core/assistant-message/presentAssistantMessage.ts` identifies the tool name and routes it to the appropriate tool handler.
- **Tool Lifecycle**: All tools inherit from `BaseTool` in `src/core/tools/BaseTool.ts`. The `handle()` method is the entry point, which calls `execute()` for non-partial messages.
- **Mutating Tools**: Key mutating tools include:
    - `writeToFileTool` (`src/core/tools/WriteToFileTool.ts`)
    - `executeCommandTool` (`src/core/tools/ExecuteCommandTool.ts`)
    - `applyDiffTool` (`src/core/tools/ApplyDiffTool.ts`)

## 2. The Shared Brain: System Prompt

The system prompt is constructed in `src/core/prompts/system.ts`. It assembles multiple sections:

- `getRoleDefinition`
- `getCapabilitiesSection`
- `getRulesSection`
- `getObjectiveSection`
- `addCustomInstructions` (where user-provided instructions are injected)

To enforce the Reasoning Loop, we must inject instructions into `getObjectiveSection` or add a new mandatory section that defines the `select_active_intent` requirement.

## 3. Sidecar Storage: `.orchestration/`

We will implement a machine-managed storage pattern in the `.orchestration/` directory:

- `active_intents.yaml`: Formal intent specifications and scope.
- `agent_trace.jsonl`: Append-only ledger of mutating actions with content hashes.
- `intent_map.md`: Spatial mapping between intents and AST nodes/files.

## 4. Integration Points for Hooks

- **Pre-Hook (Context & Validation)**: Integrated into `BaseTool.handle()`. It will verify `active_intent` and inject context.
- **Post-Hook (Traceability)**: Integrated into `BaseTool.execute()`'s completion path to log to `agent_trace.jsonl`.
- **Scope Enforcement**: Injected into `execute()` for mutating tools, comparing the target file/action against the `owned_scope` defined in `active_intents.yaml`.
