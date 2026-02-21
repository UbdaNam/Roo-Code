import * as fs from "fs/promises"
import * as path from "path"
import * as yaml from "yaml"
import { getWorkspacePath } from "../utils/path"
import { GatewayViolationError } from "./GatewayViolationError"

/**
 * @deprecated Use SelectActiveIntentTool instead. This function is maintained for backward compatibility.
 */
export async function selectActiveIntent(intentId: string): Promise<string> {
	const workspacePath = getWorkspacePath(path.join(process.env.HOME || process.env.USERPROFILE || "", "Desktop"))
	const orchestrationDir = path.join(workspacePath, ".orchestration")
	const activeIntentsPath = path.join(orchestrationDir, "active_intents.yaml")

	try {
		const fileContent = await fs.readFile(activeIntentsPath, "utf-8")
		const data = yaml.parse(fileContent)
		const intent = data.active_intents?.find((i: any) => i.id === intentId)

		if (!intent) {
			throw new GatewayViolationError(
				"Gatekeeper Violation: You must cite a valid active Intent ID using `select_active_intent` before executing any other tool.",
			)
		}

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
	} catch (error) {
		throw new Error(`Error reading active_intents.yaml: ${error instanceof Error ? error.message : String(error)}`)
	}
}
