import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { LOG_MESSAGES } from "../config/messages";
import { logger } from "../utils/logger";
import { normalizeError } from "../utils/errors";
import { toErrorResponse } from "../utils/error-response";

function textResult(payload: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    ...(isError && { isError }),
  };
}

/** Runs a service call and shapes the outcome as an MCP tool result; domain errors become isError results. */
export async function runTool(
  operation: () => Promise<unknown>,
): Promise<CallToolResult> {
  try {
    return textResult(await operation());
  } catch (error) {
    const appError = normalizeError(error);
    if (appError.statusCode >= 500)
      logger.error(LOG_MESSAGES.mcpToolFailed, error);
    return textResult(toErrorResponse(appError), true);
  }
}
