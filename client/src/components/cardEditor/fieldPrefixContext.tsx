import { createContext, useContext } from "react";

export const FieldPrefixContext = createContext<string | undefined>(undefined);

// Resolves a field's input `name` against the property path CardEditor is bound to (eg. "card"),
// so validation errors keyed by that path (eg. "card.cost") match up with the rendered input.
export function useFieldName(name: string): string {
    const prefix = useContext(FieldPrefixContext);
    return prefix ? `${prefix}.${name}` : name;
}
