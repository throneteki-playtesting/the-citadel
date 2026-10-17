import { Sort } from "common/types";
import Joi from "joi";
import { IGetRequest } from "./types";

const paging = () => ({
    page: Joi.number(),
    perPage: Joi.number()
});

function orderBy<T>(schema: Joi.ObjectSchema<T>, defaultValue?: Sort<T>) {
    const description = schema.describe();

    // Recursive internal helper to build the nested sort structure
    function buildSortSchema(desc: Joi.Description): Joi.Schema {
        if (desc.type !== "object" || !desc.keys) {
            return Joi.string().valid("asc", "desc").optional();
        }

        const sortShape: Record<string, Joi.Schema> = {};

        for (const [key, value] of Object.entries(desc.keys)) {
            const val = value as Joi.Description;
            if (val.type === "object" && val.keys) {
                sortShape[key] = buildSortSchema(val);
            } else {
                sortShape[key] = Joi.string().valid("asc", "desc").optional();
            }
        }

        return Joi.object(sortShape);
    }

    let sortSchema = buildSortSchema(description) as Joi.ObjectSchema<Sort<T>>;

    if (defaultValue) {
        sortSchema = sortSchema.default(defaultValue);
    }

    return { orderBy: sortSchema };
}
// Every outcome a conditional field can settle on, through however many conditions are nested inside it
function conditionalBranches(desc: Joi.Description): Joi.Description[] {
    const whens = (desc.whens ?? []) as { then?: Joi.Description; otherwise?: Joi.Description }[];
    return whens
        .flatMap((when) => [when.then, when.otherwise])
        .flatMap((branch) => (branch ? [branch, ...conditionalBranches(branch)] : []));
}

function buildFieldFilterSchema(fieldSchema: Joi.Schema): Joi.Schema {
    const desc = fieldSchema.describe();

    switch (desc.type) {
        case "string": {
            return Joi.alternatives()
                .try(
                    fieldSchema,
                    Joi.object({
                        $gt: Joi.string(),
                        $gte: Joi.string(),
                        $lt: Joi.string(),
                        $lte: Joi.string(),
                        $ne: Joi.string(),
                        $in: Joi.array().items(Joi.string()),
                        $nin: Joi.array().items(Joi.string()),
                        $regex: Joi.string(),
                        $exists: Joi.boolean()
                    })
                )
                .optional();
        }

        case "number": {
            return Joi.alternatives()
                .try(
                    fieldSchema,
                    Joi.object({
                        $gt: Joi.number(),
                        $gte: Joi.number(),
                        $lt: Joi.number(),
                        $lte: Joi.number(),
                        $ne: Joi.number(),
                        $in: Joi.array().items(Joi.number()),
                        $nin: Joi.array().items(Joi.number()),
                        $exists: Joi.boolean()
                    })
                )
                .optional();
        }

        case "date": {
            return Joi.alternatives()
                .try(
                    fieldSchema,
                    Joi.object({
                        $gt: Joi.alternatives().try(Joi.date(), Joi.string().isoDate()),
                        $gte: Joi.alternatives().try(Joi.date(), Joi.string().isoDate()),
                        $lt: Joi.alternatives().try(Joi.date(), Joi.string().isoDate()),
                        $lte: Joi.alternatives().try(Joi.date(), Joi.string().isoDate()),
                        $ne: Joi.alternatives().try(Joi.date(), Joi.string().isoDate()),
                        $in: Joi.array().items(Joi.alternatives().try(Joi.date(), Joi.string().isoDate())),
                        $nin: Joi.array().items(Joi.alternatives().try(Joi.date(), Joi.string().isoDate())),
                        $exists: Joi.boolean()
                    })
                )
                .optional();
        }

        case "boolean": {
            return Joi.alternatives()
                .try(fieldSchema, Joi.object({ $exists: Joi.boolean() }))
                .optional();
        }

        case "array": {
            const itemsDesc = (desc.items ?? [])[0] as Joi.Description | undefined;
            const operators: Record<string, Joi.Schema> = { $exists: Joi.boolean() };
            const alternatives: Joi.Schema[] = [fieldSchema];
            // A string-item array (eg. card.traits) is matched elementwise by Mongo against a bare
            // scalar, so it gets the same text operators plus that scalar shape (useFilter's own OR'd-branch explosion sends exactly that).
            if (itemsDesc?.type === "string") {
                operators.$regex = Joi.string();
                operators.$in = Joi.array().items(Joi.string());
                operators.$nin = Joi.array().items(Joi.string());
                operators.$ne = Joi.string();
                alternatives.push(Joi.string());
            }
            return Joi.alternatives()
                .try(...alternatives, Joi.object(operators))
                .optional();
        }

        case "object": {
            // Recurse into nested object keys
            const keys = desc.keys as Record<string, Joi.Description> | undefined;
            if (!keys) return Joi.object({ $exists: Joi.boolean() }).optional();

            const nestedShape: Record<string, Joi.Schema> = {};
            for (const [key] of Object.entries(keys)) {
                // Extract the child schema from the parent using reach
                const childSchema = (fieldSchema as Joi.ObjectSchema).extract(key);
                nestedShape[key] = buildFieldFilterSchema(childSchema);
            }

            return Joi.alternatives()
                .try(Joi.object(nestedShape), Joi.object({ $exists: Joi.boolean() }))
                .optional();
        }

        case "alternatives": {
            const value = fieldSchema.optional();
            const matches = (desc.matches ?? []) as { schema?: Joi.Description }[];
            const operators: Record<string, Joi.Schema> = { $exists: Joi.boolean() };
            // A number that may also be "X" or "-" (eg. cost) compares as a number - Mongo never ranks a string against one
            if (matches.some((match) => match.schema?.type === "number")) {
                Object.assign(operators, {
                    $gt: Joi.number(),
                    $gte: Joi.number(),
                    $lt: Joi.number(),
                    $lte: Joi.number(),
                    $ne: value,
                    $in: Joi.array().items(value),
                    $nin: Joi.array().items(value)
                });
            }
            return Joi.alternatives().try(value, Joi.object(operators)).optional();
        }

        default: {
            // A bare `Joi.when()` (eg. icons, cost) describes as "any" with no shape of its own, so the filter is
            // built from the branch which says what the field holds - the first, as none has two that differ
            const branch = conditionalBranches(desc).find(({ type }) => type !== "any");
            if (branch?.type === "object" && branch.keys) {
                const nestedShape = Object.fromEntries(
                    Object.entries(branch.keys as Record<string, Joi.Description>).map(([key, childDesc]) => [
                        key,
                        buildFieldFilterSchema(Joi.build(childDesc))
                    ])
                );
                return Joi.alternatives()
                    .try(Joi.object(nestedShape), Joi.object({ $exists: Joi.boolean() }))
                    .optional();
            }
            if (branch) {
                return buildFieldFilterSchema(Joi.build(branch));
            }
            return Joi.alternatives()
                .try(fieldSchema, Joi.object({ $exists: Joi.boolean() }))
                .optional();
        }
    }
}

function buildFilterSchema<T>(schema: Joi.ObjectSchema<T>): Joi.ObjectSchema {
    const desc = schema.describe();
    const keys = desc.keys as Record<string, Joi.Description> | undefined;
    if (!keys) return Joi.object();

    const filterShape: Record<string, Joi.Schema> = {};
    for (const key of Object.keys(keys)) {
        const childSchema = schema.extract(key);
        filterShape[key] = buildFieldFilterSchema(childSchema);
    }

    return Joi.object(filterShape);
}

export function getRequestSchema<T>(
    schema: Joi.ObjectSchema<T>,
    defaultOrderBy?: Sort<T>
): Joi.ObjectSchema<IGetRequest<T>> {
    const filterSchema = buildFilterSchema(schema);

    return Joi.object({
        filter: Joi.alternatives().try(filterSchema, Joi.array().items(filterSchema)).optional(),
        ...paging(),
        ...orderBy(schema, defaultOrderBy)
    });
}
