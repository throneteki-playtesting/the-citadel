import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import j2s from "joi-to-swagger";
import * as Schemas from "common/models/schemas";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Read all API versions based on folder structure in routes/API
const apiBasePath = path.join(__dirname, "routes", "API");
const apiVersions = fs
    .readdirSync(apiBasePath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

// Set up spec for each API version
apiVersions.forEach((apiVersion) => {
    const spec = swaggerJSDoc({
        definition: {
            openapi: "3.0.3",
            info: {
                title: "The Citadel API",
                description: "Playtesting management for the A Game of Thrones: The Card Game (2nd Edition) community",
                version: apiVersion
            },
            servers: [{ url: `${process.env.SERVER_HOST}/api/v1` }],
            consumes: ["application/json"],
            produces: ["application/json"],
            components: {
                schemas: {
                    card: {
                        full: j2s(Schemas.Card.Full).swagger,
                        partial: j2s(Schemas.Card.Partial).swagger
                    },
                    playtestingCard: {
                        full: j2s(Schemas.PlaytestingCard.Full).swagger,
                        partial: j2s(Schemas.PlaytestingCard.Partial).swagger
                    },
                    project: {
                        full: j2s(Schemas.Project.Full).swagger
                    },
                    review: {
                        full: j2s(Schemas.PlaytestingReview.Full).swagger
                    },
                    integration: {
                        full: j2s(Schemas.Integration.Full).swagger,
                        partial: j2s(Schemas.Integration.Partial).swagger
                    }
                }
            },
            tags: [
                { name: "cards", description: "Create, add and update cards" },
                { name: "projects", description: "Manage projects" },
                { name: "reviews", description: "Manage playtesting reviews of cards" },
                { name: "packs", description: "Generate card packs for json data repository" },
                { name: "custom", description: "Generate custom cards, unrelated to existing projects" }
            ]
        },
        apis: [path.join(apiBasePath, apiVersion, "**", "*.ts")]
    });

    router.use(`/api-docs/${apiVersion}`, swaggerUi.serve, swaggerUi.setup(spec));
});

export default router;
