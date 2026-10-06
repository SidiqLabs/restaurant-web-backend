import type { RequestHandler } from "express";

import { verifyAccessToken } from "../modules/auth/token.js";

export const authenticate: RequestHandler = async (
  req,
  res,
  next,
) => {
  const authorization = req.header("authorization");

  if (!authorization) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  const [scheme, token, extra] = authorization.trim().split(/\s+/);

  if (
    scheme?.toLowerCase() !== "bearer" ||
    !token ||
    extra !== undefined
  ) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  try {
    res.locals.authUserId = await verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }
};
