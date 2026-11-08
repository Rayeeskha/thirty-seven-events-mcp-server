import { ErrorRequestHandler } from 'express';
import { logger } from '../utils/logger';
import { normalizeError } from '../utils/errors';

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const appError = normalizeError(error);
  if (appError.statusCode >= 500) logger.error('Unhandled request error', error);
  res.status(appError.statusCode).json({
    error: { code: appError.code, message: appError.message, details: appError.details },
  });
};
