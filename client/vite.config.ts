import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";
import type { AppEnv } from "./env.d.ts";

const proxyPaths = ["/api/", "/auth/", "/thronesdb/"];

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "") as unknown as AppEnv;
    const serverHost = env.VITE_SERVER_HOST || "http://localhost:8080";
    return {
        plugins: [
            tailwindcss(),
            react(),
            tsconfigPaths()
        ],
        server: {
            host: true,
            port: 5173,
            watch: {
                usePolling: true
            },
            proxy: Object.fromEntries(
                proxyPaths.map((path) => [path, { target: serverHost, changeOrigin: true }])
            ),
            fs: {
                allow: [".."]
            }
        },
        define: {
            __APP_ENV__: env
        },
        optimizeDeps: {
            exclude: ["@agot/card-preview"]
        }
    };
});
