import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";
import type { AppEnv } from "./env.d.ts";

const proxyPaths = ["/api/", "/auth/", "/thronesdb/"];

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
    const env = loadEnv(mode, process.cwd(), "") as unknown as AppEnv;
    const serverHost = env.VITE_SERVER_HOST || "http://localhost:8080";
    if (command === "build" && !env.VITE_SENTRY_DSN) {
        throw new Error("VITE_SENTRY_DSN must be provided when building for production");
    }
    return {
        plugins: [tailwindcss(), react(), tsconfigPaths()],
        server: {
            host: true,
            port: 5173,
            watch: {
                usePolling: true
            },
            proxy: Object.fromEntries(proxyPaths.map((path) => [path, { target: serverHost, changeOrigin: true }])),
            fs: {
                allow: [".."]
            }
        },
        define: {
            __APP_ENV__: env
        },
        optimizeDeps: {
            exclude: ["@agot/card-preview"]
        },
        resolve: {
            // A file:-linked @agot/card-preview has its own react copy in node_modules; force a single instance
            dedupe: ["react", "react-dom"]
        }
    };
});
