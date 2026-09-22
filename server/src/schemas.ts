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
            // Handles JoiXDashNumber etc. - just allow the original schema or $exists
            return Joi.alternatives()
                .try(fieldSchema, Joi.object({ $exists: Joi.boolean() }))
                .optional();
        }

        default: {
            // A bare `Joi.when()` (eg. icons/plotStats) describes as "any" with no shape of its own -
            // rebuild the object-shaped then/otherwise branch's fields from their Description instead.
            const whens = desc.whens as { then?: Joi.Description; otherwise?: Joi.Description }[] | undefined;
            if (whens) {
                const nestedShape: Record<string, Joi.Schema> = {};
                for (const when of whens) {
                    for (const branch of [when.then, when.otherwise]) {
                        if (branch?.type !== "object" || !branch.keys) {
                            continue;
                        }
                        for (const [key, childDesc] of Object.entries(branch.keys)) {
                            // First branch wins - icons/plotStats only ever have one object-shaped branch.
                            if (!(key in nestedShape)) {
                                nestedShape[key] = buildFieldFilterSchema(Joi.build(childDesc as Joi.Description));
                            }
                        }
                    }
                }
                if (Object.keys(nestedShape).length > 0) {
                    return Joi.alternatives()
                        .try(Joi.object(nestedShape), Joi.object({ $exists: Joi.boolean() }))
                        .optional();
                }
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
