import pino from "pino";

import { env } from "../config/env.js";

export const logger = pino({
  level: env.LOG_LEVEL,

  // Sensitive credentials must never be written to application logs.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "headers.cookie",
      "password",
      "passwordHash",
      "accessToken",
      "refreshToken",
      "secret",
      "secretKey",
    ],
    censor: "[REDACTED]",
  },
});
