import { Alert } from "@heroui/react";
import { titleizeFieldName } from "./wizard/context";

// Companion to useFormValidation: surfaces errors whose paths have no rendered input to attach to,
// so a failed submit is never silent
export default function FormValidationSummary({ errors, mappedPaths = [], labelFor }: FormValidationSummaryProps) {
    const unmapped = Object.entries(errors).filter(([path]) => !mappedPaths.includes(path));
    if (unmapped.length === 0) {
        return null;
    }

    return (
        <Alert
            color="danger"
            variant="flat"
            description={
                <div className="flex flex-col gap-0.5">
                    {unmapped.map(([path, message]) => (
                        <div key={path}>
                            {labelFor?.(path) ?? titleizeFieldName(path)} — {message.charAt(0).toLowerCase()}
                            {message.slice(1)}
                        </div>
                    ))}
                </div>
            }
        />
    );
}

type FormValidationSummaryProps = {
    errors: Record<string, string>;
    /** Paths already rendered against a visible input; their errors are shown inline instead. */
    mappedPaths?: string[];
    /** Names a path where its own segments don't - eg. a list entry known by its contents rather than its index */
    labelFor?: (path: string) => string | undefined;
};
