import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      environment: env.NODE_ENV,
    },
    "HTTP server started",
  );
});

let shuttingDown = false;

// Graceful shutdown stops accepting new connections while allowing
// active requests a short window to finish before the process exits.
function shutdown(signal: NodeJS.Signals) {
  // Multiple operating-system signals must not start competing shutdowns.
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logger.info({ signal }, "Graceful shutdown started");

  server.close((error) => {
    if (error) {
      logger.error({ err: error }, "HTTP server shutdown failed");
      process.exitCode = 1;
    } else {
      logger.info("HTTP server stopped");
    }
  });

  server.closeIdleConnections?.();

  // Never allow a broken connection to keep the process alive forever.
  const timeout = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);

  timeout.unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
