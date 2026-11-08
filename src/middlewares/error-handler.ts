import { ErrorRequestHandler } from "express";
import { LOG_MESSAGES } from "../config/messages";
import { logger } from "../utils/logger";
import { normalizeError } from "../utils/errors";
import { toErrorResponse } from "../utils/error-response";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const appError = normalizeError(error);
  if (appError.statusCode >= 500)
    logger.error(LOG_MESSAGES.unhandledRequestError, error);
  res.status(appError.statusCode).json(toErrorResponse(appError));
};
