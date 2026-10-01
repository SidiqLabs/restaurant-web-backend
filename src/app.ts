import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requestId } from "./middleware/request-id.js";
import { healthRouter } from "./routes/health.js";

// Keep application construction separate from server startup so tests
// can exercise the full HTTP stack without binding to a network port.
export function createApp() {
  const app = express();

  // Avoid exposing unnecessary implementation details in HTTP responses.
  app.disable("x-powered-by");

  // Apply baseline HTTP security headers before application routes.
  app.use(helmet());

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );

  // Bound request bodies to reduce accidental or abusive memory consumption.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  app.use(requestId);

  app.use(
    pinoHttp({
      logger,
      customProps: (_req, res) => ({
        requestId:
          typeof res.locals.requestId === "string"
            ? res.locals.requestId
            : undefined,
      }),
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
        ],
        censor: "[REDACTED]",
      },
    }),
  );

  app.use("/health", healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
