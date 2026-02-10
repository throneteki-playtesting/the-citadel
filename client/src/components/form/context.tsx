/* eslint-disable @typescript-eslint/no-explicit-any */
import { DeepPartial } from "common/types";
import { createContext, useContext } from "react";

export const FormContext = createContext<FormContextProps<any> | null>(null);

export function useForm<T>(): FormContextProps<T> {
    const context = useContext(FormContext);
    if (!context) {
        throw new Error("Components with useForm must be used within a Form provider");
    }
    return context as FormContextProps<T>;
}

export type FormContextProps<T> = {
    data: DeepPartial<T>,
    setData: React.Dispatch<React.SetStateAction<DeepPartial<T>>>
    validationErrors: Record<string, string>
}