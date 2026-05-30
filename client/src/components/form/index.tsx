/* eslint-disable @typescript-eslint/no-explicit-any */
import { DeepPartial } from "common/types";
import Joi from "joi";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { FormContext, FormContextProps } from "./context";
import { FormProps as HeroFormProps, Form as HeroForm } from "@heroui/react";
import { unflatten } from "flat";
import { merge } from "lodash-es";

const Form = function<T>({ schema, data: initial, onSubmit: onFormSubmit = () => true, onValidationError = () => true, allowEmptyValues = false, children, ...props }: FormProps<T>) {
    const [internalData, setInternalData] = useState({} as DeepPartial<T>);
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        setInternalData(initial ?? {} as DeepPartial<T>);
    }, [initial]);

    const validate = useCallback((data: Record<string, any>) => {
        const { error } = schema.validate(data, {
            allowUnknown: true,
            abortEarly: false
        });

        if (error) {
            const inputErrors: Record<string, string> = {};
            error.details.forEach((detail) => {
                // Needs to match input ids on page
                const inputId = detail.path.join(".");
                const message = detail.message.replace(new RegExp(`^"${inputId}"\\s+`), () => "").replace(/^\w/, (c) => c.toUpperCase());
                inputErrors[inputId] = message;
            });

            if (Object.keys(inputErrors).length > 0) {
                console.error("Validation Error Details:", inputErrors);
                setValidationErrors(inputErrors);
                onValidationError(inputErrors);
                return false;
            }
        }

        setValidationErrors({});
        return true;
    }, [onValidationError, schema]);

    const onSubmit = useCallback((e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        let data: Record<string, any> = {};

        // Gather all form data
        const formData = new FormData(e.target as HTMLFormElement);
        data = Object.fromEntries(formData.entries());
        if (!allowEmptyValues) {
            // Sanitises "" values into undefined. Usually helps with validation
            data = Object.keys(data).reduce<Record<string, any>>((acc, key) => {
                const value = data[key];
                acc[key] = value === "" ? undefined : value;
                return acc;
            }, {});
        }

        data = unflatten<Record<string, any>, Record<string, any>>(data);

        const newData = merge({}, data, internalData);
        // Validate & Submit
        if (validate(newData)) {
            onFormSubmit(newData as T);
        }
    }, [allowEmptyValues, internalData, onFormSubmit, validate]);

    const contextValue = useMemo<FormContextProps<T>>(() => ({
        data: internalData,
        setData: setInternalData,
        validationErrors
    }), [internalData, setInternalData, validationErrors]);

    return (
        <FormContext.Provider value={contextValue}>
            <HeroForm
                onSubmit={onSubmit}
                validationErrors={validationErrors}
                {...props}
            >
                {children}
            </HeroForm>
        </FormContext.Provider>
    );
};

type FormProps<T> = Omit<HeroFormProps, "onSubmit" | "children"> & {
    schema: Joi.Schema,
    data?: DeepPartial<T>,
    onSubmit?: (data: T) => void,
    onValidationError?: (errors: Record<string, string>) => void,
    allowEmptyValues?: boolean,
    children: ReactNode | ReactNode[]
}

export default Form;