import { Task } from "../core/task/Task"
import { ToolUse } from "../shared/tools"

export interface HookContext {
	task: Task
	toolUse: ToolUse<any>
	parameters: any
}

export interface PreHookResult {
	shouldContinue: boolean
	modifiedParameters?: any
	injectedContext?: string
}

export interface PostHookResult {
	success: boolean
	error?: any
	contentHash?: string
	traceData?: any
}

export interface IntentSpec {
	id: string
	name: string
	status: string
	owned_scope: string[]
	constraints: string[]
	acceptance_criteria: string[]
}

export interface AgentTraceEntry {
	id: string
	timestamp: string
	vcs: {
		revision_id: string
	}
	files: Array<{
		relative_path: string
		conversations: Array<{
			url: string
			contributor: {
				entity_type: "AI" | "Human"
				model_identifier: string
			}
			ranges: Array<{
				start_line: number
				end_line: number
				content_hash: string
			}>
			related: Array<{
				type: "specification"
				value: string
			}>
		}>
	}>
}

export interface HookEngineConfig {
	enableIntentEnforcement: boolean
	enableContentHashing: boolean
	enableTraceLogging: boolean
}
