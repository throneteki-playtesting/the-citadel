import path from "path";
import { fileURLToPath } from "url";
import GasPlugin from "gas-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    context: __dirname,
    mode: "development", // 'production' will minify the output
    devtool: false,
    optimization: {
        minimize: false
    },
    entry: "./src/index.ts",
    output: {
        filename: "code.js",
        path: path.resolve(__dirname, "dist")
    },
    resolve: {
        extensions: [".ts", ".js"],
        alias: {
            common: path.resolve(__dirname, "../common")
        }
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: "ts-loader",
                exclude: /node_modules/
            }
        ]
    },
    plugins: [
        new GasPlugin({
            autoGlobalExportsFiles: ["src/index.ts"]
        }),
        new CopyPlugin({
            patterns: [{ from: "appsscript.json", to: "appsscript.json" }]
        })
    ]
};
