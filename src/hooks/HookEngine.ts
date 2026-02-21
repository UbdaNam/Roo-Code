import { v4 as uuidv4 } from "uuid"
import * as fs from "fs/promises"
import * as path from "path"
import * as yaml from "yaml"
import { createHash } from "crypto"
import { Task } from "../core/task/Task"
import { ToolUse } from "../shared/tools"
import { HookContext, PreHookResult, PostHookResult, IntentSpec, AgentTraceEntry } from "./types"
import { fileExistsAtPath } from "../utils/fs"
import { GatewayViolationError } from "./GatewayViolationError"

// Simple similarity function for intent matching
function calculateSimilarity(text1: string, text2: string): number {
	// Convert to lowercase and remove punctuation
	const clean1 = text1.toLowerCase().replace(/[^\w\s]/g, "")
	const clean2 = text2.toLowerCase().replace(/[^\w\s]/g, "")

	// Split into words
	const words1 = clean1.split(/\s+/)
	const words2 = clean2.split(/\s+/)

	// Find common words
	const commonWords = words1.filter((word) => words2.includes(word))

	// Calculate similarity as ratio of common words to total unique words
	const uniqueWords = [...new Set([...words1, ...words2])]
	return uniqueWords.length > 0 ? commonWords.length / uniqueWords.length : 0
}

export class HookEngine {
	private static instance: HookEngine
	private config: any
	private orchestrationDir: string

	private constructor(workspacePath: string) {
		this.orchestrationDir = path.join(workspacePath, ".orchestration")
		this.config = {
			enableIntentEnforcement: true,
			enableContentHashing: true,
			enableTraceLogging: true,
		}
	}

	static getInstance(workspacePath: string): HookEngine {
		if (!HookEngine.instance) {
			HookEngine.instance = new HookEngine(workspacePath)
		}
		return HookEngine.instance
	}

	async initialize(): Promise<void> {
		// Create orchestration directory if it doesn't exist
		await fs.mkdir(this.orchestrationDir, { recursive: true })

		// Initialize required files
		await this.initializeOrchestrationFiles()
	}

	private async initializeOrchestrationFiles(): Promise<void> {
		// Initialize agent_trace.jsonl
		const tracePath = path.join(this.orchestrationDir, "agent_trace.jsonl")
		const traceExists = await fileExistsAtPath(tracePath)
		if (!traceExists) {
			await fs.writeFile(tracePath, "", { encoding: "utf-8" })
		}

		// Initialize intent_map.md if it doesn't exist
		const intentMapPath = path.join(this.orchestrationDir, "intent_map.md")
		const intentMapExists = await fileExistsAtPath(intentMapPath)
		if (!intentMapExists) {
			await fs.writeFile(
				intentMapPath,
				"# Intent Map\n\nThis file maps high-level business intents to physical files and AST nodes.\n",
				{ encoding: "utf-8" },
			)
		}

		// Initialize AGENT.md if it doesn't exist
		const agentMdPath = path.join(this.orchestrationDir, "AGENT.md")
		const agentMdExists = await fileExistsAtPath(agentMdPath)
		if (!agentMdExists) {
			await fs.writeFile(
				agentMdPath,
				"# Agent Knowledge Base\n\nPersistent knowledge base shared across parallel sessions.\n",
				{ encoding: "utf-8" },
			)
		}
	}

	// PreToolUse Hook - Intercept tool calls before execution
	async preToolUse(task: Task, toolUse: ToolUse<any>, userPrompt?: string): Promise<PreHookResult> {
		const context: HookContext = {
			task,
			toolUse,
			parameters: toolUse.nativeArgs || toolUse.params,
		}

		// Intent Enforcement for select_active_intent tool
		if (toolUse.name === "select_active_intent") {
			return await this.handleIntentSelection(context)
		}

		// Intent Gatekeeping - All other tools require active intent
		if (this.config.enableIntentEnforcement && !task.activeIntentId) {
			// Try auto intent selection if user prompt is provided
			if (userPrompt) {
				try {
					const autoSelectResult = await this.handleAutoIntentSelection(task, userPrompt)
					if (autoSelectResult.shouldContinue) {
						// Auto selection successful, continue with the tool execution
						const injectedContext = autoSelectResult.injectedContext
						return {
							shouldContinue: true,
							injectedContext,
						}
					}
				} catch (error) {
					if (error instanceof GatewayViolationError) {
						throw error
					}
					// Fall through to manual intent selection requirement
				}
			}

			return {
				shouldContinue: false,
				injectedContext:
					"Gatekeeper Violation: You must cite a valid active Intent ID using `select_active_intent` before executing any other tool.",
			}
		}

		// Inject intent context for all tools
		const injectedContext = await this.injectIntentContext(task)

		return {
			shouldContinue: true,
			injectedContext,
		}
	}

	// PostToolUse Hook - Intercept tool calls after execution
	async postToolUse(
		task: Task,
		toolUse: ToolUse<any>,
		result: { success: boolean; error?: any },
	): Promise<PostHookResult> {
		const context: HookContext = {
			task,
			toolUse,
			parameters: toolUse.nativeArgs || toolUse.params,
		}

		// Log trace entry
		if (this.config.enableTraceLogging && task.activeIntentId) {
			const traceData = await this.logTraceEntry(context, result)

			// Calculate content hash if applicable
			let contentHash: string | undefined
			if (this.config.enableContentHashing) {
				contentHash = await this.calculateContentHash(context, result)
			}

			return {
				success: result.success,
				error: result.error,
				contentHash,
				traceData,
			}
		}

		return {
			success: result.success,
			error: result.error,
		}
	}

	private async handleIntentSelection(context: HookContext): Promise<PreHookResult> {
		const intentId = context.parameters?.intent_id
		if (!intentId) {
			return {
				shouldContinue: false,
				injectedContext: "Error: Intent ID is required for select_active_intent tool",
			}
		}

		try {
			// Load active intents from YAML
			const activeIntentsPath = path.join(this.orchestrationDir, "active_intents.yaml")
			const fileContent = await fs.readFile(activeIntentsPath, "utf-8")
			const data = yaml.parse(fileContent)
			const intent = data.active_intents?.find((i: any) => i.id === intentId)

			if (!intent) {
				throw new GatewayViolationError(
					"Gatekeeper Violation: You must cite a valid active Intent ID using `select_active_intent` before executing any other tool.",
				)
			}

			// Query recent history for this intent
			const recentHistory = await this.queryRecentIntentHistory(intentId)

			// Store active intent in task state
			;(context.task as any).activeIntentId = intentId
			;(context.task as any).activeIntent = intent

			// Generate comprehensive intent context with history
			const intentContext = this.generateComprehensiveIntentContextWithHistory(intent, recentHistory)

			return {
				shouldContinue: true,
				injectedContext: intentContext,
			}
		} catch (error) {
			return {
				shouldContinue: false,
				injectedContext: `Error reading active_intents.yaml: ${error instanceof Error ? error.message : String(error)}`,
			}
		}
	}

	private async queryRecentIntentHistory(intentId: string): Promise<any[]> {
		// Query the agent_trace.jsonl for recent entries related to this intent
		const tracePath = path.join(this.orchestrationDir, "agent_trace.jsonl")
		try {
			const traceContent = await fs.readFile(tracePath, "utf-8")
			const lines = traceContent.trim().split("\n")
			const recentEntries = []

			// Look at last 10 entries (or all if less than 10)
			const startIndex = Math.max(0, lines.length - 10)
			for (let i = startIndex; i < lines.length; i++) {
				if (lines[i].trim()) {
					try {
						const entry = JSON.parse(lines[i])
						if (entry.intent_id === intentId) {
							recentEntries.push(entry)
						}
					} catch (parseError) {
						// Skip malformed entries
					}
				}
			}

			return recentEntries
		} catch (error) {
			console.warn(`Could not read intent history: ${error}`)
			return []
		}
	}

	private generateComprehensiveIntentContextWithHistory(intent: IntentSpec, history: any[]): string {
		const historySection =
			history.length > 0 ? `\nRecent History:\n${JSON.stringify(history.slice(-3), null, 2)}` : ""

		return `
<intent_context>
ID: ${intent.id}
Name: ${intent.name}
Status: ${intent.status}
Owned Scope: ${JSON.stringify(intent.owned_scope, null, 2)}
Constraints: ${JSON.stringify(intent.constraints, null, 2)}
Acceptance Criteria: ${JSON.stringify(intent.acceptance_criteria, null, 2)}${historySection}
</intent_context>
`.trim()
	}

	private async injectIntentContext(task: Task): Promise<string | undefined> {
		if (!task.activeIntentId || !task.activeIntent) {
			return undefined
		}

		const intent = task.activeIntent as IntentSpec

		return this.generateComprehensiveIntentContext(intent)
	}

	private generateComprehensiveIntentContext(intent: IntentSpec): string {
		return `
<intent_context>
ID: ${intent.id}
Name: ${intent.name}
Status: ${intent.status}
Owned Scope: ${JSON.stringify(intent.owned_scope, null, 2)}
Constraints: ${JSON.stringify(intent.constraints, null, 2)}
Acceptance Criteria: ${JSON.stringify(intent.acceptance_criteria, null, 2)}
</intent_context>
`.trim()
	}

	private async logTraceEntry(context: HookContext, result: { success: boolean; error?: any }): Promise<any> {
		if (!context.task.activeIntentId) {
			return null
		}

		const gitSha = await this.getCurrentGitSha()

		const traceEntry: AgentTraceEntry = {
			id: uuidv4(),
			timestamp: new Date().toISOString(),
			vcs: {
				revision_id: gitSha,
			},
			files: [],
		}

		// Add file information if applicable
		const filePath = context.parameters?.path || context.parameters?.file_path
		if (filePath) {
			traceEntry.files.push({
				relative_path: filePath,
				conversations: [
					{
						url: `task-${(context.task as any).id || "unknown"}`,
						contributor: {
							entity_type: "AI",
							model_identifier: "unknown",
						},
						ranges: [],
						related: [
							{
								type: "specification",
								value: context.task.activeIntentId,
							},
						],
					},
				],
			})
		}

		// Write to agent_trace.jsonl
		const tracePath = path.join(this.orchestrationDir, "agent_trace.jsonl")
		const entryLine = JSON.stringify(traceEntry) + "\n"
		await fs.appendFile(tracePath, entryLine, { encoding: "utf-8" })

		return traceEntry
	}

	private async calculateContentHash(
		context: HookContext,
		result: { success: boolean; error?: any },
	): Promise<string | undefined> {
		// Calculate content hash for file operations
		const content = context.parameters?.content || context.parameters?.diff
		if (content) {
			return createHash("sha256").update(content).digest("hex")
		}
		return undefined
	}

	private async getCurrentGitSha(): Promise<string> {
		// Placeholder for git SHA retrieval
		try {
			// In a real implementation, you would execute git rev-parse HEAD
			return "git_sha_placeholder"
		} catch {
			return "unknown"
		}
	}

	async updateIntentMap(intentId: string, filePath: string, astNode?: string): Promise<void> {
		const intentMapPath = path.join(this.orchestrationDir, "intent_map.md")
		const mapContent = await fs.readFile(intentMapPath, "utf-8")

		const newEntry = `\n## ${intentId}\n- File: ${filePath}${astNode ? `\n- AST Node: ${astNode}` : ""}`
		const updatedContent = mapContent + newEntry

		await fs.writeFile(intentMapPath, updatedContent, { encoding: "utf-8" })
	}

	// Auto intent selection based on user prompt analysis
	async autoSelectIntent(task: Task, userPrompt: string): Promise<string | null> {
		try {
			// Load active intents from YAML
			const activeIntentsPath = path.join(this.orchestrationDir, "active_intents.yaml")
			const fileContent = await fs.readFile(activeIntentsPath, "utf-8")
			const data = yaml.parse(fileContent)
			const intents = data.active_intents || []

			if (intents.length === 0) {
				return null
			}

			// Score each intent based on similarity to user prompt
			const scoredIntents = intents.map((intent: IntentSpec) => {
				// Combine intent name and criteria for matching
				const intentText = `${intent.name} ${intent.constraints.join(" ")} ${intent.acceptance_criteria.join(" ")}`
				const score = calculateSimilarity(userPrompt, intentText)
				return { intent, score }
			})

			// Sort by score (highest first)
			scoredIntents.sort((a: { score: number }, b: { score: number }) => b.score - a.score)

			// Return the ID of the best matching intent if score is above threshold
			const bestMatch = scoredIntents[0]
			const threshold = 0.1 // Minimum similarity threshold

			if (bestMatch.score >= threshold) {
				return bestMatch.intent.id
			}

			return null
		} catch (error) {
			console.warn(`Failed to auto-select intent: ${error}`)
			return null
		}
	}

	// Method to automatically handle intent selection based on user prompt
	async handleAutoIntentSelection(task: Task, userPrompt: string): Promise<PreHookResult> {
		const intentId = await this.autoSelectIntent(task, userPrompt)

		if (!intentId) {
			throw new GatewayViolationError(
				"Gatekeeper Violation: You must cite a valid active Intent ID using `select_active_intent` before executing any other tool.",
			)
		}

		// Load the selected intent
		try {
			const activeIntentsPath = path.join(this.orchestrationDir, "active_intents.yaml")
			const fileContent = await fs.readFile(activeIntentsPath, "utf-8")
			const data = yaml.parse(fileContent)
			const intent = data.active_intents?.find((i: any) => i.id === intentId)

			if (!intent) {
				throw new GatewayViolationError(
					"Gatekeeper Violation: You must cite a valid active Intent ID using `select_active_intent` before executing any other tool.",
				)
			}

			// Query recent history for this intent
			const recentHistory = await this.queryRecentIntentHistory(intentId)

			// Store active intent in task state
			;(task as any).activeIntentId = intentId
			;(task as any).activeIntent = intent

			// Generate comprehensive intent context with history
			const intentContext = this.generateComprehensiveIntentContextWithHistory(intent, recentHistory)

			return {
				shouldContinue: true,
				injectedContext: intentContext,
			}
		} catch (error) {
			return {
				shouldContinue: false,
				injectedContext: `Error reading active_intents.yaml: ${error instanceof Error ? error.message : String(error)}`,
			}
		}
	}

	async appendToAgentKnowledge(content: string): Promise<void> {
		const agentMdPath = path.join(this.orchestrationDir, "AGENT.md")
		const timestamp = new Date().toISOString()
		const newEntry = `\n\n## ${timestamp}\n${content}`

		const existingContent = await fs.readFile(agentMdPath, "utf-8")
		const updatedContent = existingContent + newEntry

		await fs.writeFile(agentMdPath, updatedContent, { encoding: "utf-8" })
	}
}
