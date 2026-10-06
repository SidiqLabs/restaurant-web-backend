import { Router } from "express";

import { authenticate } from "../middleware/authenticate.js";
import {
  login,
  profile,
  register,
} from "../modules/auth/auth.controller.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.get("/profile", authenticate, profile);
