export const ERROR_MESSAGES = {
  validationFailed: "Validation failed",
  requestBodyTooLarge: "Request body is too large",
  requestBodyInvalidJson: "Request body must be valid JSON",
  unexpected: "An unexpected error occurred",
  invalidEnvironmentConfiguration: (problems: string) =>
    `Invalid environment configuration:\n${problems}`,
  confirmation: {
    invalid: "Confirmation token is not recognised",
    expired: "Confirmation token has expired; request a new confirmation",
    alreadyUsed: "Confirmation token has already been used",
    parametersMismatch:
      "The parameters differ from those that were proposed for this confirmation token",
  },
  eventNotFound: (resource: string, id: number | string) =>
    `${resource} with id ${id} was not found`,
  eventStatusUnchanged: (eventId: number, status: string) =>
    `Event ${eventId} already has status ${status}`,
  eventStatusChanged: (eventId: number, current: string, expected: string) =>
    `Event ${eventId} is now ${current}, not ${expected} as when the change was proposed; request a new confirmation`,
  marketingCancelled:
    "Marketing content cannot be drafted for a cancelled event",
  marketingCancelledDetail: (eventId: number) =>
    `Event ${eventId} is CANCELLED`,
  routeNotFound: (method: string, url: string) =>
    `Route ${method} ${url} was not found`,
} as const;

export const LOG_MESSAGES = {
  startupFailed: "Failed to start",
  mcpRequestFailed: "MCP request failed",
  mcpToolFailed: "MCP tool failed",
  unhandledRequestError: "Unhandled request error",
} as const;

export const VALIDATION_MESSAGES = {
  validIsoDate: "Must be a valid date in YYYY-MM-DD format",
  dateFromBeforeDateTo: "date_from must not be after date_to",
  eventIdPositiveInteger: "id must be a positive integer",
  poolMinimumExceedsMaximum: "must be less than or equal to DB_POOL_MAX",
  databasePasswordRequiredInProduction: "must not be empty in production",
} as const;

export const MCP_MESSAGES = {
  methodNotAllowed: "Method not allowed. This server is stateless; use POST.",
  internalServerError: "Internal server error",
} as const;
