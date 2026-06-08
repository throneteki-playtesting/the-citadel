const verbose = process.env.VERBOSE === "true";

export const log = {
    info: (msg: string) => console.log(`  ${msg}`),
    success: (msg: string) => console.log(`✓ ${msg}`),
    warn: (msg: string) => console.warn(`⚠ ${msg}`),
    error: (msg: string, err?: unknown) => {
        console.error(`✗ ${msg}`);
        if (err) console.error(err);
    },
    verbose: (msg: string) => {
        if (verbose) console.log(`  [verbose] ${msg}`);
    },
    section: (msg: string) => console.log(`\n── ${msg} ──`)
};

// Writes a progress line that overwrites itself on each call.
// Call log.progress.done() to finalise it with a newline.
export function createProgress(label: string) {
    let last = "";

    const write = (msg: string) => {
        // Pad to overwrite any leftover characters from a longer previous line
        const line = `  ${label}: ${msg}`;
        const padded = line.padEnd(last.length, " ");
        last = line;
        process.stdout.write(`\r${padded}`);
    };

    const counter = (current: number, total: number, suffix = "") => {
        write(`${current} / ${total}${suffix ? `  ${suffix}` : ""}`);
    };

    const done = (summary?: string) => {
        const finalLine = summary ? `  ${label}: ${summary}` : last;
        process.stdout.write(`\r${finalLine.padEnd(last.length, " ")}\n`);
        last = "";
    };

    return { write, counter, done };
}