import * as fs from "fs/promises"
import * as path from "path"
import * as yaml from "yaml"
import { Task } from "../core/task/Task"
import { HookContext, IntentSpec } from "./types"

export class IntentHook {
	static async loadIntent(workspacePath: string, intentId: string): Promise<IntentSpec | null> {
		try {
			const orchestrationDir = path.join(workspacePath, ".orchestration")
			const activeIntentsPath = path.join(orchestrationDir, "active_intents.yaml")

			const fileContent = await fs.readFile(activeIntentsPath, "utf-8")
			const data = yaml.parse(fileContent)
			const intent = data.active_intents?.find((i: any) => i.id === intentId)

			return intent || null
		} catch (error) {
			console.error(`Failed to load intent ${intentId}:`, error)
			return null
		}
	}

	static async validateIntentScope(task: Task, intent: IntentSpec, filePath: string): Promise<boolean> {
		// Check if the file path is within the intent's owned scope
		for (const scope of intent.owned_scope) {
			// Simple glob matching (in a real implementation, you'd use a proper glob library)
			if (scope.includes("**")) {
				const basePath = scope.replace("/**", "")
				if (filePath.startsWith(basePath)) {
					return true
				}
			} else if (filePath === scope || filePath.startsWith(scope)) {
				return true
			}
		}
		return false
	}

	static async updateIntentStatus(workspacePath: string, intentId: string, newStatus: string): Promise<void> {
		try {
			const orchestrationDir = path.join(workspacePath, ".orchestration")
			const activeIntentsPath = path.join(orchestrationDir, "active_intents.yaml")

			const fileContent = await fs.readFile(activeIntentsPath, "utf-8")
			const data = yaml.parse(fileContent)

			const intentIndex = data.active_intents?.findIndex((i: any) => i.id === intentId)
			if (intentIndex !== undefined && intentIndex >= 0) {
				data.active_intents[intentIndex].status = newStatus

				const updatedContent = yaml.stringify(data)
				await fs.writeFile(activeIntentsPath, updatedContent, "utf-8")
			}
		} catch (error) {
			console.error(`Failed to update intent status for ${intentId}:`, error)
		}
	}

	static generateIntentContext(intent: IntentSpec): string {
		return `
<intent_context>
ID: ${intent.id}
Name: ${intent.name}
Status: ${intent.status}
Scope: ${JSON.stringify(intent.owned_scope)}
Constraints: ${JSON.stringify(intent.constraints)}
Acceptance Criteria: ${JSON.stringify(intent.acceptance_criteria)}
</intent_context>
`.trim()
	}
}
