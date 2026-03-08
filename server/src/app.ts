import "@/config";
import express from "express";
import partials from "express-partials";
import compression from "compression";
import cors from "cors";
import api from "./routes/API/index";
import thronesdb from "./routes/thronesdb/index";
import auth from "./routes/auth/index";
import { logger } from "@/services";
import swaggerRouter from "./swagger";
import cookieParser from "cookie-parser";
import { errorHandler } from "./errors";
import { StatusCodes } from "http-status-codes";

function initialise() {
    // Add express
    const app = express();

    // Add middleware
    app.use(cors({
        origin: process.env.CLIENT_HOST,
        credentials: true
    }));
    app.use(partials());
    app.use(compression());
    app.use(express.static("public"));
    app.use(express.json());

    app.use(cookieParser());

    // Register API
    app.use("/api", api);

    // Register thronesdb endpoints
    app.use("/thronesdb", thronesdb);

    // Route authentication services (eg. Discord)
    app.use("/auth", auth);

    app.use(swaggerRouter);

    app.use(errorHandler);

    app.use((req, res) => {
        res.status(StatusCodes.NOT_FOUND).send("Not Found");
    });

    app.listen(process.env.SERVER_PORT, () => {
        logger.info(`Server running on port ${process.env.SERVER_PORT}: ${process.env.SERVER_HOST}`);
        logger.info(`Environment configured as "${process.env.NODE_ENV}"`);
    });

    return app;
}

initialise();
