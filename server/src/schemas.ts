import { Sortable } from "common/types";
import Joi from "joi";

export const paging = () => ({
    page: Joi.number(),
    perPage: Joi.number()
});

export function orderBy<T>(schema: Joi.ObjectSchema<T>, defaultValue?: Sortable<T>) {
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

    let sortSchema = buildSortSchema(description) as Joi.ObjectSchema<Sortable<T>>;

    if (defaultValue) {
        sortSchema = sortSchema.default(defaultValue);
    }

    return { orderBy: sortSchema };
}