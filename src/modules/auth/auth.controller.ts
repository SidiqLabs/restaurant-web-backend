import type {
  RequestHandler,
  Response,
} from "express";

import {
  AuthConflictError,
  AuthenticatedUserNotFoundError,
  InvalidCredentialsError,
  getProfile,
  loginUser,
  registerUser,
} from "./auth.service.js";
import {
  loginSchema,
  registerSchema,
} from "./auth.schema.js";

function sendInvalidRequest(res: Response): void {
  res.status(400).json({
    success: false,
    message: "Invalid request",
  });
}

export const register: RequestHandler = async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    sendInvalidRequest(res);
    return;
  }

  try {
    const result = await registerUser(parsed.data);

    res.status(201).json({
      success: true,
      message: "Registration successful",
      data: result,
    });
  } catch (error) {
    if (error instanceof AuthConflictError) {
      res.status(409).json({
        success: false,
        message: "Email is already registered",
      });
      return;
    }

    throw error;
  }
};

export const login: RequestHandler = async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    sendInvalidRequest(res);
    return;
  }

  try {
    const result = await loginUser(parsed.data);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: result,
    });
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    throw error;
  }
};

export const profile: RequestHandler = async (_req, res) => {
  const authUserId: unknown = res.locals.authUserId;

  if (typeof authUserId !== "string") {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  try {
    const user = await getProfile(authUserId);

    res.status(200).json({
      success: true,
      message: "Profile retrieved",
      data: user,
    });
  } catch (error) {
    if (error instanceof AuthenticatedUserNotFoundError) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    throw error;
  }
};
