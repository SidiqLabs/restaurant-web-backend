import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Service is healthy",
    data: {
      status: "ok",
    },
  });
});
