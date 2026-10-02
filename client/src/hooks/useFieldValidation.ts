import { useCallback, useEffect, useRef } from "react";
import { useFormValidationState } from "@react-stately/form";

// A custom field's error, found in the form by its name as a native input's is, and cleared on its next edit
export function useFieldValidation<T>(name: string | undefined, value: T) {
    const validation = useFormValidationState<T>({ name, value, validationBehavior: "native" });
    const { isInvalid, validationErrors } = validation.displayValidation;

    const validationRef = useRef(validation);
    useEffect(() => {
        validationRef.current = validation;
    });

    const commit = useCallback(() => {
        if (validationRef.current.displayValidation.isInvalid) {
            validationRef.current.commitValidation();
        }
    }, []);

    return { isInvalid, errorMessage: validationErrors.join(" ") || undefined, commit };
}
