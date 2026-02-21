import * as fs from "fs/promises"
import * as path from "path"
import { createHash } from "crypto"
import { Task } from "../task/Task"
import { ToolUse } from "../../shared/tools"
import { fileExistsAtPath } from "../../utils/fs"

export interface AgentTraceEntry {
	timestamp: string
	intent_id: string
	tool_name: string
	action: string
	file_path?: string
	content_hash?: string
	diff_hash?: string
	command?: string
	parameters: Record<string, any>
	success: boolean
	error?: string
	duration_ms?: number
}

export class AgentTracer {
	private static readonly TRACE_FILE = "agent_trace.jsonl"
	private startTime: number | undefined

	static async initialize(task: Task): Promise<void> {
		const orchestrationDir = path.join(task.workspacePath, ".orchestration")
		await fs.mkdir(orchestrationDir, { recursive: true })

		// Create agent_trace.jsonl if it doesn't exist
		const tracePath = path.join(orchestrationDir, AgentTracer.TRACE_FILE)
		const exists = await fileExistsAtPath(tracePath)
		if (!exists) {
			// File doesn't exist, create it
			await fs.writeFile(tracePath, "", { encoding: "utf-8" })
		}
	}

	startTiming(): void {
		this.startTime = Date.now()
	}

	getDuration(): number | undefined {
		return this.startTime ? Date.now() - this.startTime : undefined
	}

	async logAction(
		task: Task,
		toolName: string,
		action: string,
		parameters: Record<string, any>,
		success: boolean,
		error?: string,
		additionalData?: {
			filePath?: string
			content?: string
			diff?: string
			command?: string
		},
	): Promise<void> {
		if (!task.activeIntentId) {
			return // Don't log if no active intent
		}

		const traceEntry: AgentTraceEntry = {
			timestamp: new Date().toISOString(),
			intent_id: task.activeIntentId,
			tool_name: toolName,
			action,
			parameters,
			success,
			error,
			duration_ms: this.getDuration(),
			...additionalData,
		}

		// Add content hashing if content is provided
		if (additionalData?.content) {
			traceEntry.content_hash = this.createContentHash(additionalData.content)
		}

		// Add diff hashing if diff is provided
		if (additionalData?.diff) {
			traceEntry.diff_hash = this.createContentHash(additionalData.diff)
		}

		// Add file path if provided
		if (additionalData?.filePath) {
			traceEntry.file_path = additionalData.filePath
		}

		// Add command if provided
		if (additionalData?.command) {
			traceEntry.command = additionalData.command
		}

		await this.writeTraceEntry(task, traceEntry)
	}

	private async writeTraceEntry(task: Task, entry: AgentTraceEntry): Promise<void> {
		const orchestrationDir = path.join(task.workspacePath, ".orchestration")
		const tracePath = path.join(orchestrationDir, AgentTracer.TRACE_FILE)

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
}

// Pre-execution hook for all tools
export async function agentTracePreHook(toolName: string, params: any, task: Task): Promise<void> {
	const tracer = new AgentTracer()
	tracer.startTiming()

	// Log the tool invocation attempt
	await tracer.logAction(
		task,
		toolName,
		"invoking",
		params,
		true, // We're logging the attempt, not the result
		undefined,
		{
			filePath: params.path || params.file_path,
			command: params.command,
			diff: params.diff,
		},
	)
}

// Post-execution hook for all tools
export async function agentTracePostHook(
	toolName: string,
	params: any,
	task: Task,
	result: { success: boolean; error?: any },
): Promise<void> {
	const tracer = new AgentTracer()

	// Log the tool execution result
	await tracer.logAction(
		task,
		toolName,
		"completed",
		params,
		result.success,
		result.error ? String(result.error) : undefined,
		{
			filePath: params.path || params.file_path,
			command: params.command,
			diff: params.diff,
		},
	)
}
