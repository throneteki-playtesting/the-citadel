import { heroui } from "@heroui/react";
import { statementColors, thronesColors } from "../common/utils";

/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                serif: ["'EB Garamond'", "serif"],
                sans: ["'Raleway'", "sans-serif"],
                crimson: ["'Crimson Text'", "serif"],
                opensans: ["'Open Sans'", "sans-serif"],
                thronesdb: ["'thronesdb'", "serif"],
                cinzel: ["'Cinzel'", "serif"]
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
                        background: "#F9F5EE",
                        foreground: "#2C2416",

                        content1: "#F1EBE0",
                        content2: "#E6DDD0",
                        content3: "#D6CDB8",
                        content4: "#C4B89E",

                        primary: {
                            DEFAULT: "#C5A059",
                            foreground: "#2C2416",
                            50: "#FAF5E8",
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

                        secondary: {
                            DEFAULT: "#7A6E5A",
                            foreground: "#F9F5EE",
                            50: "#F4F0E8",
                            100: "#E8E0D0",
                            200: "#D0C4A8",
                            300: "#B8A880",
                            400: "#A09060",
                            500: "#7A6E5A",
                            600: "#625848",
                            700: "#4A4236",
                            800: "#322C24",
                            900: "#1A1612"
                        },

                        success: {
                            DEFAULT: "#22663C",
                            foreground: "#FFFFFF",
                            50: "#EBF5EE",
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

                        danger: {
                            DEFAULT: "#8A262E",
                            foreground: "#FFFFFF",
                            50: "#F8ECED",
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

                        warning: {
                            DEFAULT: "#B45A1E",
                            foreground: "#FFFFFF",
                            50: "#FDF3E6",
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
                        divider: "#D6CDB8"
                    }
                },

                dark: {
                    colors: {
                        background: "#0A0A0C",
                        foreground: "#ECECEC",

                        content1: "#121218",
                        content2: "#1C1C24",
                        content3: "#2C2C38",
                        content4: "#3A3A48",

                        primary: {
                            DEFAULT: "#C5A059",
                            foreground: "#0A0A0C",
                            50: "#4F2E00",
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
                            DEFAULT: "#8A8A9A",
                            foreground: "#0A0A0C",
                            50: "#101018",
                            100: "#1A1A28",
                            200: "#2A2A3A",
                            300: "#3A3A4E",
                            400: "#505062",
                            500: "#6A6A7A",
                            600: "#8A8A9A",
                            700: "#AAAAB8",
                            800: "#C8C8D4",
                            900: "#E6E6EE"
                        },

                        success: {
                            DEFAULT: "#5BAF77",
                            foreground: "#0A0A0C",
                            50: "#07160C",
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
                            foreground: "#0A0A0C",
                            50: "#1C0709",
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
                            foreground: "#0A0A0C",
                            50: "#241206",
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
                        divider: "#2C2C38"
                    }
                }
            }
        })
    ]
};
