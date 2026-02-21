import { createHash } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"
import { v4 as uuidv4 } from "uuid"
import { Task } from "../core/task/Task"
import { AgentTraceEntry } from "./types"

export class TraceHook {
	private static instance: TraceHook
	private orchestrationDir: string

	private constructor(workspacePath: string) {
		this.orchestrationDir = path.join(workspacePath, ".orchestration")
	}

	static getInstance(workspacePath: string): TraceHook {
		if (!TraceHook.instance) {
			TraceHook.instance = new TraceHook(workspacePath)
		}
		return TraceHook.instance
	}

	async logToolExecution(
		task: Task,
		toolName: string,
		parameters: any,
		result: { success: boolean; error?: any },
		filePath?: string,
		content?: string,
	): Promise<void> {
		if (!task.activeIntentId) {
			return // Don't log if no active intent
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
		if (filePath) {
			const ranges = []
			if (content && this.shouldCalculateContentHash()) {
				const contentHash = this.createContentHash(content)
				ranges.push({
					start_line: 1, // Simplified - in a real implementation you'd track actual line ranges
					end_line: content.split("\n").length,
					content_hash: `sha256:${contentHash}`,
				})
			}

			traceEntry.files.push({
				relative_path: filePath,
				conversations: [
					{
						url: `task-${(task as any).id || "unknown"}`,
						contributor: {
							entity_type: "AI",
							model_identifier: "unknown",
						},
						ranges,
						related: [
							{
								type: "specification",
								value: (task as any).activeIntentId || "unknown",
							},
						],
					},
				],
			})
		}

		// Write to agent_trace.jsonl
		await this.writeTraceEntry(traceEntry)
	}

	private async writeTraceEntry(entry: AgentTraceEntry): Promise<void> {
		const tracePath = path.join(this.orchestrationDir, "agent_trace.jsonl")
		try {
			const entryLine = JSON.stringify(entry) + "\n"
			await fs.appendFile(tracePath, entryLine, { encoding: "utf-8" })
		} catch (error) {
			console.error(`Failed to write agent trace entry: ${error}`)
			// Don't throw - tracing failures shouldn't break tool execution
		}
	}

	createContentHash(content: string): string {
		return createHash("sha256").update(content).digest("hex")
	}

	private shouldCalculateContentHash(): boolean {
		// Configuration-based decision
		return true // Always calculate in this implementation
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
		try {
			const mapContent = await fs.readFile(intentMapPath, "utf-8")

			const newEntry = `\n## ${intentId}\n- File: ${filePath}${astNode ? `\n- AST Node: ${astNode}` : ""}`
			const updatedContent = mapContent + newEntry

			await fs.writeFile(intentMapPath, updatedContent, { encoding: "utf-8" })
		} catch (error) {
			console.error(`Failed to update intent map:`, error)
		}
	}

	async appendToAgentKnowledge(content: string): Promise<void> {
		const agentMdPath = path.join(this.orchestrationDir, "AGENT.md")
		try {
			const timestamp = new Date().toISOString()
			const newEntry = `\n\n## ${timestamp}\n${content}`

			const existingContent = await fs.readFile(agentMdPath, "utf-8")
			const updatedContent = existingContent + newEntry

			await fs.writeFile(agentMdPath, updatedContent, { encoding: "utf-8" })
		} catch (error) {
			console.error(`Failed to append to agent knowledge:`, error)
		}
	}
}
