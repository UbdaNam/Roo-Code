import * as fs from "fs/promises"
import * as path from "path"
import * as yaml from "yaml"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { Task } from "../task/Task"
import { SelectActiveIntentParams } from "@roo-code/types"

export class SelectActiveIntentTool extends BaseTool<"select_active_intent"> {
	readonly name = "select_active_intent" as const

	async execute(params: SelectActiveIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { intent_id } = params
		const orchestrationDir = path.join(task.workspacePath, ".orchestration")
		const activeIntentsPath = path.join(orchestrationDir, "active_intents.yaml")

		try {
			const fileContent = await fs.readFile(activeIntentsPath, "utf-8")
			const data = yaml.parse(fileContent)
			const intent = data.active_intents?.find((i: any) => i.id === intent_id)

			if (!intent) {
				await callbacks.pushToolResult(`Error: Intent ID '${intent_id}' not found in active_intents.yaml`)
				return
			}

			// Store active intent in task state (we'll need to add this property to Task)
			;(task as any).activeIntentId = intent_id
			;(task as any).activeIntent = intent

			const context = `
<intent_context>
ID: ${intent.id}
Name: ${intent.name}
Status: ${intent.status}
Scope: ${JSON.stringify(intent.owned_scope)}
Constraints: ${JSON.stringify(intent.constraints)}
Acceptance Criteria: ${JSON.stringify(intent.acceptance_criteria)}
</intent_context>
`.trim()

			await callbacks.pushToolResult(context)
		} catch (error) {
			await callbacks.handleError("reading active_intents.yaml", error as Error)
		}
	}
}

export const selectActiveIntentTool = new SelectActiveIntentTool()
