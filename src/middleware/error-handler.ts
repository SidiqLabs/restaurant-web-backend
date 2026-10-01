import type { ErrorRequestHandler } from "express";

import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const requestId =
    typeof res.locals.requestId === "string"
      ? res.locals.requestId
      : undefined;

  logger.error(
    {
      err: error,
      requestId,
    },
    "Unhandled request error",
  );

  res.status(500).json({
    success: false,
    message: "Internal server error",
    ...(requestId ? { requestId } : {}),
    ...(env.NODE_ENV === "development" && error instanceof Error
      ? { error: error.message }
      : {}),
  });
};
