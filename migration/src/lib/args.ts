// Reads --flag=value or --flag value out of an argv slice, without disturbing bare boolean flags
export function getArgValue(args: string[], flag: string): string | undefined {
    const prefix = `--${flag}=`;
    const inline = args.find((arg) => arg.startsWith(prefix));
    if (inline) {
        return inline.slice(prefix.length);
    }

    const index = args.indexOf(`--${flag}`);
    if (index !== -1 && args[index + 1] && !args[index + 1].startsWith("--")) {
        return args[index + 1];
    }

    return undefined;
}
