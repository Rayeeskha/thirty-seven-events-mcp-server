import { ZodError } from "zod";
import { ERROR_MESSAGES } from "../config/messages";

export interface ErrorDetail {
  path: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string = ERROR_MESSAGES.validationFailed,
    details?: ErrorDetail[],
  ) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: number | string) {
    super(404, "NOT_FOUND", ERROR_MESSAGES.eventNotFound(resource, id));
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}

const CONFIRMATION_FAILURES = {
  INVALID: { status: 400, code: "CONFIRMATION_TOKEN_INVALID" },
  EXPIRED: { status: 410, code: "CONFIRMATION_TOKEN_EXPIRED" },
  ALREADY_USED: { status: 409, code: "CONFIRMATION_TOKEN_ALREADY_USED" },
  PARAMETERS_MISMATCH: {
    status: 422,
    code: "CONFIRMATION_PARAMETERS_MISMATCH",
  },
} as const;

export type ConfirmationFailure = keyof typeof CONFIRMATION_FAILURES;

export class ConfirmationError extends AppError {
  constructor(
    public readonly reason: ConfirmationFailure,
    message: string,
  ) {
    super(
      CONFIRMATION_FAILURES[reason].status,
      CONFIRMATION_FAILURES[reason].code,
      message,
    );
  }
}

interface BodyParserError {
  type: "entity.parse.failed" | "entity.too.large";
}

function isBodyParserError(error: unknown): error is BodyParserError {
  if (typeof error !== "object" || error === null || !("type" in error))
    return false;
  const { type } = error as { type: unknown };
  return type === "entity.parse.failed" || type === "entity.too.large";
}

export function toErrorDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

/** Converts anything thrown into an AppError so every transport reports errors uniformly. */
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError)
    return new ValidationError(
      ERROR_MESSAGES.validationFailed,
      toErrorDetails(error),
    );
  if (isBodyParserError(error)) {
    return error.type === "entity.too.large"
      ? new AppError(
          413,
          "PAYLOAD_TOO_LARGE",
          ERROR_MESSAGES.requestBodyTooLarge,
        )
      : new ValidationError(ERROR_MESSAGES.requestBodyInvalidJson);
  }
  return new AppError(500, "INTERNAL_ERROR", ERROR_MESSAGES.unexpected);
}
