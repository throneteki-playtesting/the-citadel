/* eslint-disable @typescript-eslint/no-explicit-any */
import { DeepPartial } from "common/types";
import { createContext, useContext } from "react";

export const WizardContext = createContext<WizardContextProps<any> | null>(null);

export function useWizard<T>(): WizardContextProps<T> {
    const context = useContext(WizardContext);
    if (!context) {
        throw new Error("Wizard components must be used within a Wizard provider");
    }
    return context as WizardContextProps<T>;
}

// A schema re-check on a field may clear its own or a prior server verdict, but never an "external" one
// (eg. a DB uniqueness check) - Joi has no way to know whether that still applies.
export type WizardErrorSource = "schema" | "external" | "server";
export type WizardFieldError = { message: string, source: WizardErrorSource };

export function countErrorsInDirection(
    fieldErrors: Record<string, WizardFieldError>,
    fieldMeta: Record<string, WizardFieldMeta>,
    currentPage: number,
    direction: "back" | "next"
): number {
    const count = Object.entries(fieldErrors).filter(([path, error]) => {
        if (error.source !== "server") {
            return false;
        }
        const meta = fieldMeta[path];
        if (!meta) {
            return false;
        }
        return direction === "back" ? meta.onPage < currentPage : meta.onPage > currentPage;
    }).length;
    return count;
}

export function titleizeFieldName(name: string): string {
    const leaf = name.split(".").pop() ?? name;
    const spaced = leaf.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type WizardFieldMeta = { onPage: number, label: string };

export type WizardContextProps<T> = {
    id: string,
    currentPage: number,
    totalPages: number,
    setTotalPages: React.Dispatch<React.SetStateAction<number>>,
    data: DeepPartial<T>,
    setData: React.Dispatch<React.SetStateAction<DeepPartial<T>>>
    isFirstPage: boolean,
    isLastPage: boolean,
    validationErrors: Record<string, string>,
    fieldErrors: Record<string, WizardFieldError>,
    setError: (path: string, message: string) => void,
    clearError: (path: string) => void,
    isValidationError: (err: unknown) => boolean,
    fieldMeta: Record<string, WizardFieldMeta>,
    setFieldMeta: React.Dispatch<React.SetStateAction<Record<string, WizardFieldMeta>>>,
    onPageSubmit: (data: Record<string, any>) => void,
    onPageBack: () => void
}
