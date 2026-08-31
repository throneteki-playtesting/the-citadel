export type Environment = "development" | "staging" | "production";

export const ENVIRONMENTS: Environment[] = ["development", "staging", "production"];

export function isEnvironment(value: string): value is Environment {
    return (ENVIRONMENTS as string[]).includes(value);
}

export function resolveDatabase(environment: Environment): { url: string; name: string } {
    const prefix = environment.toUpperCase();
    const url = process.env[`${prefix}_DATABASE_URL`];
    const name = process.env[`${prefix}_DATABASE_NAME`];

    if (!url || !name) {
        throw new Error(`${prefix}_DATABASE_URL and ${prefix}_DATABASE_NAME must be set in your .env`);
    }

    return { url, name };
}
