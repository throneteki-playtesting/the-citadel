import { DeepPartial, isOperatorObject, SingleOrArray } from "common/types";

type DotPath<T, Prefix extends string = ""> = DeepPartial<
  Record<
    {
      [K in keyof T]: T[K] extends object
        ? T[K] extends Array<unknown>
          ? `${Prefix}${Extract<K, string>}`
          : `${Prefix}${Extract<K, string>}` | DotPathKeys<T[K], `${Prefix}${Extract<K, string>}.`>
        : `${Prefix}${Extract<K, string>}`
    }[keyof T],
    string | number | boolean
  >
>;

type DotPathKeys<T, Prefix extends string = ""> = {
  [K in keyof T]: T[K] extends object
    ? T[K] extends Array<unknown>
      ? `${Prefix}${Extract<K, string>}`
      : `${Prefix}${Extract<K, string>}` | DotPathKeys<T[K], `${Prefix}${Extract<K, string>}.`>
    : `${Prefix}${Extract<K, string>}`
}[keyof T];

function expandDotPaths<T extends object>(flat: DotPath<T>): T {
    const result: Record<string, unknown> = {};

    for (const [path, value] of Object.entries(flat)) {
        if (value === undefined) continue;

        const keys = path.split(".");
        let current: Record<string, unknown> = result;

        keys.forEach((key, index) => {
            const isLast = index === keys.length - 1;

            if (isLast) {
                current[key] = value;
            } else {
                if (typeof current[key] !== "object" || current[key] === null) {
                    current[key] = {};
                }
                current = current[key] as Record<string, unknown>;
            }
        });
    }

    return result as T;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

function castIsoDates(value: unknown): unknown {
    if (typeof value === "string" && ISO_DATE_RE.test(value)) {
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d;
    }
    if (Array.isArray(value)) return value.map(castIsoDates);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, castIsoDates(v)])
        );
    }
    return value;
}

export const parseAPIRequest = (
    req: { query: Record<string, unknown> },
    res: unknown,
    next: (arg?: unknown) => void
) => {
    try {
        const objects = ["filter", "orderBy"];
        const numbers = ["page", "perPage"];

        for (const property in req.query) {
            if (objects.includes(property)) {
                const value = req.query[property];
                if (value && typeof value === "string") {
                    const decoded = decodeURIComponent(value);
                    let parsed = JSON.parse(decoded) as SingleOrArray<object>;

                    const convert = (o: object): object => {
                        if (isOperatorObject(o)) {
                            // Cast ISO dates within operator objects, but don't expand dot paths
                            return castIsoDates(o) as object;
                        }
                        return expandDotPaths(castIsoDates(o) as DotPath<typeof o>);
                    };

                    parsed = Array.isArray(parsed) ? parsed.map(convert) : convert(parsed);
                    req.query[property] = parsed;
                }
            }

            if (numbers.includes(property)) {
                const value = req.query[property];
                if (value && typeof value === "string") {
                    req.query[property] = parseInt(value, 10);
                }
            }
        }
    } catch (err) {
        next(err);
        return;
    }
    next();
};