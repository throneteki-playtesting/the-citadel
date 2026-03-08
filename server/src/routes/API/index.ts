import express from "express";
import v1 from "./v1";
import { authMiddleware } from "@/middleware/auth";
import { contextMiddleware } from "@/middleware/context";

const router = express.Router();
router.use(authMiddleware);
router.use(contextMiddleware);
router.use("/v1", v1);

export default router;