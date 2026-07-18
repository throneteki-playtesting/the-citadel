import { celebrate as celebrateBase, CelebrateOptions, Joi, Segments, SchemaOptions } from "celebrate";

// Applies `errors.label: false` (label-free Joi messages, eg. "is required" not "\"strength\" is required")
// per-call rather than on the schemas themselves - baking it into a schema's own prefs breaks Joi's
// manifest validation (used by `.describe()`, eg. server/src/schemas.ts's buildFilterSchema), which only
// allows `label: 'path' | 'key'`.
export function celebrate<P = unknown, ResBody = unknown, ReqBody = unknown, ReqQuery = unknown>(
    requestRules: SchemaOptions,
    joiOpts: Joi.ValidationOptions = {},
    opts?: CelebrateOptions
) {
    return celebrateBase<P, ResBody, ReqBody, ReqQuery>(requestRules, { errors: { label: false }, ...joiOpts }, opts);
}

export { Joi, Segments };
