export type Environment = "development" | "staging" | "production";

export function currentEnvironment(): Environment {
    return (process.env.NODE_ENV || "development") as Environment;
}

export function isEnvironment(...environments: Environment[]): boolean {
    return environments.includes(currentEnvironment());
}
