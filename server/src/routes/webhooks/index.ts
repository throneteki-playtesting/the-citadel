import express from "express";
import github from "./github";

const router = express.Router();
router.use("/github", github);

export default router;
