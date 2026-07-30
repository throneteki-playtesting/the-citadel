import { useCallback, useState } from "react";
import Joi from "joi";
import { toNormalizedError } from "../api/errors";

// The wizard's schema & server-field-error handling, extracted for standalone forms: feed `errors`
// to a HeroUI Form, gate submission on validate(), and pass API errors through isValidationError()
export function useFormValidation(schema: Joi.Schema) {
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = useCallback(
        (data: unknown): boolean => {
            const { error } = schema.validate(data, {
                allowUnknown: true,
                abortEarly: false,
                errors: { label: false }
            });

            const inputErrors: Record<string, string> = {};
            if (error) {
                error.details.forEach((detail) => {
                    const inputId = detail.path.join(".");
                    inputErrors[inputId] = detail.message.replace(/^\w/, (c) => c.toUpperCase());
                });
            }
            setErrors(inputErrors);
            return Object.keys(inputErrors).length === 0;
        },
        [schema]
    );

    const isValidationError = useCallback((err: unknown): boolean => {
        const normalized = toNormalizedError(err);
        if (normalized.kind === "validation" && normalized.fields) {
            setErrors(Object.fromEntries(normalized.fields.map(({ path, message }) => [path, message])));
            return true;
        }
        return false;
    }, []);

    const clearError = useCallback((path: string) => {
        setErrors((prev) => {
            if (!(path in prev)) {
                return prev;
            }
            const next = { ...prev };
            delete next[path];
            return next;
        });
    }, []);

    const clearErrors = useCallback(() => setErrors({}), []);

    return { errors, validate, isValidationError, clearError, clearErrors };
}
