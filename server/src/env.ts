export type Environment = "development" | "staging" | "production";

export function isEnvironment(...environments: Environment[]): boolean {
    return environments.includes((process.env.NODE_ENV || "development") as Environment);
}
