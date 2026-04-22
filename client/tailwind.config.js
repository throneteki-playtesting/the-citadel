import { heroui } from "@heroui/react";
import { thronesColors } from "../common/utils";

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}"
    ],
    theme: {
        extend: {
            fontFamily: {
                serif: ["'Noto Serif'", "serif"],
                sans: ["'Inter'", "sans-serif"],
                crimson: ["'Crimson Text'", "serif"],
                opensans: ["'Open Sans'", "sans-serif"],
                thronesdb: ["'thronesdb'", "serif"]
            },
            colors: {
                ...thronesColors,
                citadel: {
                    gold: {
                        DEFAULT: "197 160 89",
                        light: "233 193 118",
                        dark: "154 143 128"
                    },
                    obsidian: {
                        DEFAULT: "17 19 22",
                        paper: "26 28 31",
                        muted: "78 70 57"
                    },
                    ivory: {
                        DEFAULT: "249 247 242",
                        paper: "255 255 255",
                        muted: "226 226 230"
                    }
                }
            },
            letterSpacing: {
                widest: ".2em",
                tighter: "-.05em"
            }
        },
        container: {
            center: true
        }
    },
    darkMode: "class",
    plugins: [
        heroui({
            defaultTheme: "dark",
            themes: {
                light: {
                    colors: {
                        background: "#F9F7F2",
                        foreground: "#111316",
                        primary: {
                            DEFAULT: "#C5A059",
                            foreground: "#111316"
                        },
                        focus: "#C5A059",
                        content1: "#ffffff"
                    }
                },
                dark: {
                    colors: {
                        background: "#111316",
                        foreground: "#e2e2e6",
                        primary: {
                            DEFAULT: "#C5A059",
                            foreground: "#111316"
                        },
                        focus: "#C5A059",
                        content1: "#1a1c1f"
                    }
                }
            }
        })
    ]
};