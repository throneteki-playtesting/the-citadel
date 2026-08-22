// Modifier reads as Cmd on a mac and Ctrl everywhere else; a tooltip should say what the user presses
const isApple = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export const mod = isApple ? "⌘" : "Ctrl";
