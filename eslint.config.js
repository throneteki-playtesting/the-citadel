import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: ["**/dist/**", "**/node_modules/**"] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ["**/*.{ts,tsx,js,mjs}"],
        languageOptions: {
            ecmaVersion: "latest",
            globals: {
                ...globals.browser,
                ...globals.node
            }
        },
        plugins: {
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": "warn",
            "arrow-spacing": [
                "warn",
                {
                    before: true,
                    after: true
                }
            ],
            "comma-dangle": ["error", "never"],
            "comma-spacing": "error",
            "comma-style": "error",
            curly: ["error", "multi-line", "consistent"],
            "dot-location": ["error", "property"],
            "handle-callback-err": "off",
            "keyword-spacing": "error",
            "max-nested-callbacks": [
                "error",
                {
                    max: 4
                }
            ],
            "max-statements-per-line": [
                "error",
                {
                    max: 2
                }
            ],
            "no-console": "off",
            "no-case-declarations": "off",
            "@typescript-eslint/no-duplicate-enum-values": "off",
            "no-empty-function": "error",
            "no-fallthrough": "off",
            "no-floating-decimal": "error",
            "no-lonely-if": "error",
            "no-multi-spaces": "error",
            "no-multiple-empty-lines": [
                "error",
                {
                    max: 2,
                    maxEOF: 1,
                    maxBOF: 0
                }
            ],
            "no-trailing-spaces": ["error"],
            "no-var": "error",
            "object-curly-spacing": ["error", "always"],
            "prefer-const": "error",
            quotes: ["error", "double", { avoidEscape: true }],
            semi: ["error", "always"],
            "space-before-blocks": "error",
            "space-before-function-paren": [
                "error",
                {
                    // Prettier owns this: it emits `function ()` but `function <T>()` for generics,
                    // which no single setting of this rule can express
                    anonymous: "ignore",
                    named: "never",
                    asyncArrow: "always"
                }
            ],
            "space-in-parens": "error",
            "space-infix-ops": "error",
            "space-unary-ops": "error",
            yoda: "error"
        },
        settings: {
            react: {
                version: "detect"
            }
        }
    }
);
