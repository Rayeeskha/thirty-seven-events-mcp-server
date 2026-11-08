import { AppError } from "./errors";

export function toErrorResponse(error: AppError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
  };
}
