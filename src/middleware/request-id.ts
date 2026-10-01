import { randomUUID } from "node:crypto";

import type { RequestHandler } from "express";

export const requestId: RequestHandler = (req, res, next) => {
  // Accept a caller-provided correlation ID only within a bounded size;
  // otherwise generate one locally to keep every request traceable.
  const incoming = req.header("x-request-id")?.trim();
  const id = incoming && incoming.length <= 128 ? incoming : randomUUID();

  res.locals.requestId = id;
  res.setHeader("x-request-id", id);

  next();
};
