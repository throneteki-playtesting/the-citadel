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
    onPageSubmit: (data: Record<string, any>) => void,
    onPageBack: () => void
}