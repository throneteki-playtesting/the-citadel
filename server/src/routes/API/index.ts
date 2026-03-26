import express from "express";
import v1 from "./v1";
import { authMiddleware } from "@/middleware/auth";

const router = express.Router();
router.use(authMiddleware);
router.use("/v1", v1);

export default router;