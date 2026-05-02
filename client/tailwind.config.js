import { heroui } from "@heroui/react";
import { statementColors, thronesColors } from "../common/utils";

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
                ...statementColors,
                citadel: {
                    gold: {
                        DEFAULT: "rgb(197 160 89)",
                        light: "rgb(233 193 118)",
                        dark: "rgb(154 143 128)",
                        subtle: "rgb(245 237 214)"
                    },
                    valor: {
                        DEFAULT: "rgb(34 102 60)",
                        light: "rgb(235 245 238)",
                        dark: "rgb(22 70 40)",
                        subtle: "rgb(214 237 221)"
                    },
                    blood: {
                        DEFAULT: "rgb(138 38 46)",
                        light: "rgb(248 236 237)",
                        dark: "rgb(100 26 32)",
                        subtle: "rgb(240 210 213)"
                    },
                    raven: {
                        DEFAULT: "rgb(42 74 122)",
                        light: "rgb(232 238 248)",
                        dark: "rgb(28 52 90)",
                        subtle: "rgb(210 222 242)"
                    },
                    iron: {
                        DEFAULT: "rgb(80 96 112)",
                        light: "rgb(236 240 244)",
                        dark: "rgb(52 64 76)",
                        subtle: "rgb(218 226 234)"
                    },
                    ember: {
                        DEFAULT: "rgb(180 90 30)",
                        light: "rgb(253 243 230)",
                        dark: "rgb(130 62 18)",
                        subtle: "rgb(250 230 205)"
                    }
                }
            },
            letterSpacing: {
                widest: ".2em",
                tighter: "-.05em"
            },
            fontSize: {
                xxs: ["0.625rem", { lineHeight: "0.875rem" }]
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
                        // Page & surface hierarchy
                        background: "#F9F7F2",
                        foreground: "#111316",

                        // content1 = cards, panels, stat cards
                        // content2 = recessed surfaces (table headers, section bg)
                        // content3 = borders, dividers
                        // content4 = muted borders, subtle rules
                        content1: "#FFFFFF",
                        content2: "#F4F1EB",
                        content3: "#E2E0DA",
                        content4: "#CCCAC4",

                        // Primary = gold, used for accents, active states, links
                        primary: {
                            DEFAULT: "#C5A059",
                            foreground: "#111316",
                            50:  "#FAF5E8",
                            100: "#F5EBD1",
                            200: "#EAD4A0",
                            300: "#DFBE70",
                            400: "#D4A840",
                            500: "#C5A059",
                            600: "#A8833A",
                            700: "#8A6620",
                            800: "#6D4A0A",
                            900: "#4F2E00"
                        },

                        // Secondary = iron (neutral UI chrome)
                        secondary: {
                            DEFAULT: "#505F70",
                            foreground: "#FFFFFF",
                            50:  "#ECF0F4",
                            100: "#D9E0E8",
                            200: "#B3C1D1",
                            300: "#8DA2BA",
                            400: "#6783A3",
                            500: "#505F70",
                            600: "#3F4E5D",
                            700: "#2F3D4A",
                            800: "#1F2C37",
                            900: "#101B24"
                        },

                        // Success = valor (buff, active, ready)
                        success: {
                            DEFAULT: "#22663C",
                            foreground: "#FFFFFF",
                            50:  "#EBF5EE",
                            100: "#D6EBDD",
                            200: "#ADD7BB",
                            300: "#84C399",
                            400: "#5BAF77",
                            500: "#22663C",
                            600: "#1B5230",
                            700: "#143E24",
                            800: "#0E2A18",
                            900: "#07160C"
                        },

                        // Danger = blood (nerf, error, critical)
                        danger: {
                            DEFAULT: "#8A262E",
                            foreground: "#FFFFFF",
                            50:  "#F8ECED",
                            100: "#F1D9DB",
                            200: "#E3B3B7",
                            300: "#D58D93",
                            400: "#C7676F",
                            500: "#8A262E",
                            600: "#6E1E25",
                            700: "#53161C",
                            800: "#370F13",
                            900: "#1C0709"
                        },

                        // Warning = ember (caution, pending)
                        warning: {
                            DEFAULT: "#B45A1E",
                            foreground: "#FFFFFF",
                            50:  "#FDF3E6",
                            100: "#FAE7CD",
                            200: "#F5CF9B",
                            300: "#F0B769",
                            400: "#EB9F37",
                            500: "#B45A1E",
                            600: "#904818",
                            700: "#6C3612",
                            800: "#48240C",
                            900: "#241206"
                        },

                        focus: "#C5A059",

                        divider: "#E2E0DA"
                    }
                },

                dark: {
                    colors: {
                        background: "#111316",
                        foreground: "#E8E6E1",

                        content1: "#1A1C1F",
                        content2: "#212329",
                        content3: "#2E3038",
                        content4: "#3D3F48",

                        primary: {
                            DEFAULT: "#C5A059",
                            foreground: "#111316",
                            50:  "#4F2E00",
                            100: "#6D4A0A",
                            200: "#8A6620",
                            300: "#A8833A",
                            400: "#C5A059",
                            500: "#D4A840",
                            600: "#DFBE70",
                            700: "#EAD4A0",
                            800: "#F5EBD1",
                            900: "#FAF5E8"
                        },

                        secondary: {
                            DEFAULT: "#8DA2BA",
                            foreground: "#111316",
                            50:  "#101B24",
                            100: "#1F2C37",
                            200: "#2F3D4A",
                            300: "#3F4E5D",
                            400: "#505F70",
                            500: "#6783A3",
                            600: "#8DA2BA",
                            700: "#B3C1D1",
                            800: "#D9E0E8",
                            900: "#ECF0F4"
                        },

                        success: {
                            DEFAULT: "#5BAF77",
                            foreground: "#111316",
                            50:  "#07160C",
                            100: "#0E2A18",
                            200: "#143E24",
                            300: "#1B5230",
                            400: "#22663C",
                            500: "#5BAF77",
                            600: "#84C399",
                            700: "#ADD7BB",
                            800: "#D6EBDD",
                            900: "#EBF5EE"
                        },

                        danger: {
                            DEFAULT: "#C7676F",
                            foreground: "#111316",
                            50:  "#1C0709",
                            100: "#370F13",
                            200: "#53161C",
                            300: "#6E1E25",
                            400: "#8A262E",
                            500: "#C7676F",
                            600: "#D58D93",
                            700: "#E3B3B7",
                            800: "#F1D9DB",
                            900: "#F8ECED"
                        },

                        warning: {
                            DEFAULT: "#EB9F37",
                            foreground: "#111316",
                            50:  "#241206",
                            100: "#48240C",
                            200: "#6C3612",
                            300: "#904818",
                            400: "#B45A1E",
                            500: "#EB9F37",
                            600: "#F0B769",
                            700: "#F5CF9B",
                            800: "#FAE7CD",
                            900: "#FDF3E6"
                        },

                        focus: "#C5A059",

                        divider: "#2E3038"
                    }
                }
            }
        })
    ]
};