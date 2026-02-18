import type OpenAI from "openai"

const SELECT_ACTIVE_INTENT_DESCRIPTION = `Select an active intent from .orchestration/active_intents.yaml to load its context (scope, constraints, and acceptance criteria). This tool MUST be called before writing any code to ensure alignment with formalized business requirements.`

const selectActiveIntent: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "select_active_intent",
		description: SELECT_ACTIVE_INTENT_DESCRIPTION,
		parameters: {
			type: "object",
			properties: {
				intent_id: {
					type: "string",
					description: "The unique ID of the intent (e.g., 'INT-001') from active_intents.yaml",
				},
			},
			required: ["intent_id"],
		},
	},
}

export default selectActiveIntent
