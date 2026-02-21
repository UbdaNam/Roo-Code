/**
 * Error thrown when gatekeeper constraints are violated.
 * This error stops agent execution and requires explicit user intervention.
 */
export class GatewayViolationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "GatewayViolationError"

		// Maintain proper stack trace in V8
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, GatewayViolationError)
		}
	}
}
