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
