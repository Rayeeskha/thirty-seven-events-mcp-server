import { RequestHandler } from "express";
import { ERROR_MESSAGES } from "../config/messages";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: ERROR_MESSAGES.routeNotFound(req.method, req.originalUrl),
    },
  });
};
