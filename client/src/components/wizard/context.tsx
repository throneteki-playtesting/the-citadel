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

// Scoped to the single `WizardPage` a field lives on, not the global current-page - every page is
// mounted at once, so this tells "has MY page's Next/Submit been pressed" apart from any other's.
export const WizardPageSubmitContext = createContext(false);

export function useWizardPageSubmitted(): boolean {
    return useContext(WizardPageSubmitContext);
}

// A schema re-check on a field may clear its own or a prior server verdict, but never an "external" one
// (eg. a DB uniqueness check) - Joi has no way to know whether that still applies.
export type WizardErrorSource = "schema" | "external" | "server";
export type WizardFieldError = { message: string; source: WizardErrorSource };

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

// `flatten()` recurses into plain objects, so a NESTED field never appears as its own key - only its
// leaves do. A path is "covered" if it's in the key set, or anything nested under it is.
export function isPathCovered(path: string, flatKeys: readonly string[]): boolean {
    return flatKeys.includes(path) || flatKeys.some((key) => key.startsWith(`${path}.`));
}

// The other direction of the same gap: a changed LEAF needs to also clear whatever error is keyed
// on one of ITS ancestors, since a leaf changing is exactly what answers for its parent object.
export function withPathAncestors(paths: readonly string[]): string[] {
    const expanded = new Set<string>();
    for (const path of paths) {
        const parts = path.split(".");
        for (let i = 1; i <= parts.length; i++) {
            expanded.add(parts.slice(0, i).join("."));
        }
    }
    return [...expanded];
}

export function titleizeFieldName(name: string): string {
    const leaf = name.split(".").pop() ?? name;
    const spaced = leaf.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type WizardFieldMeta = { onPage: number; label: string };

export type WizardContextProps<T> = {
    id: string;
    currentPage: number;
    totalPages: number;
    setTotalPages: React.Dispatch<React.SetStateAction<number>>;
    data: DeepPartial<T>;
    setData: React.Dispatch<React.SetStateAction<DeepPartial<T>>>;
    isFirstPage: boolean;
    isLastPage: boolean;
    validationErrors: Record<string, string>;
    fieldErrors: Record<string, WizardFieldError>;
    setError: (path: string, message: string) => void;
    clearError: (path: string) => void;
    /** Retires the errors of fields whose value has since changed, so nothing outlives what it described */
    clearAnsweredErrors: (paths: string[]) => void;
    isValidationError: (err: unknown) => boolean;
    fieldMeta: Record<string, WizardFieldMeta>;
    setFieldMeta: React.Dispatch<React.SetStateAction<Record<string, WizardFieldMeta>>>;
    onPageSubmit: (data: Record<string, any>) => void;
    onPageBack: () => void;
};
