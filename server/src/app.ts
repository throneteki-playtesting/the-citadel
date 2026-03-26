import express from "express";
import partials from "express-partials";
import compression from "compression";
import cors from "cors";
import api from "./routes/API/index";
import thronesdb from "./routes/thronesdb/index";
import webhooks from "./routes/webhooks";
import auth from "./routes/auth/index";
import { dataService, logger } from "@/services";
import swaggerRouter from "./swagger";
import cookieParser from "cookie-parser";
import { errorHandler } from "./errors";
import { StatusCodes } from "http-status-codes";

const app = express();

// Register global middleware
app.use(cors({
    origin: process.env.CLIENT_HOST,
    credentials: true
}));
app.use(partials());
app.use(express.json());
app.use(cookieParser());

// Register relevant endpoints
app.use("/api", api);
app.use("/thronesdb", thronesdb);
app.use("/webhooks", webhooks);
app.use("/auth", auth);

// Register swagger (WIP)
app.use(swaggerRouter);

app.use(compression());

// Handle errors & catch-all not found
app.use(errorHandler);
app.use((req, res) => {
    res.status(StatusCodes.NOT_FOUND).send("Not Found");
});

// Data service is a requirement for server to function
await dataService.ready;

app.listen(process.env.SERVER_PORT, () => {
    logger.info(`Server running on port ${process.env.SERVER_PORT}: ${process.env.SERVER_HOST}`);
    logger.info(`Environment configured as "${process.env.NODE_ENV}"`);
});