import { useMemo } from "react";
import classNames from "classnames";
import { Alert } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { TouchTooltip } from "../../touchTooltip";
import useFlashOnChange from "../../../hooks/useFlashOnChange";
import { titleizeFieldName, useWizard } from "../context";

// Unmapped errors have no red input to point the user at, so — unlike input-attached messages, which
// are deliberately label-free — these need the field spelled out.
function describeUnmappedError(path: string, message: string): string {
    return `${titleizeFieldName(path)} ${message.charAt(0).toLowerCase()}${message.slice(1)}`;
}

export default function ValidationSummary() {
    const { fieldErrors, fieldMeta } = useWizard();

    const { hasMappedErrors, unmappedErrors, serverErrors } = useMemo(() => {
        const entries = Object.entries(fieldErrors)
            .filter(([, error]) => error.source === "server")
            .map(([path, error]) => [path, error.message] as [string, string]);
        return {
            hasMappedErrors: entries.some(([path]) => fieldMeta[path]),
            unmappedErrors: entries.filter(([path]) => !fieldMeta[path]),
            serverErrors: entries
        };
    }, [fieldErrors, fieldMeta]);

    const isFlashing = useFlashOnChange(JSON.stringify(serverErrors));

    if (!hasMappedErrors && unmappedErrors.length === 0) {
        return null;
    }

    return (
        <Alert
            color="danger"
            variant="flat"
            className={classNames(
                "transition-all duration-700 ring-2 ring-inset ring-offset-0",
                isFlashing ? "ring-danger" : "ring-transparent"
            )}
        >
            <div className="flex flex-col gap-1">
                {hasMappedErrors && (
                    <div>Some inputs on this form are invalid.</div>
                )}
                {unmappedErrors.length > 0 && (
                    <div className="flex items-center gap-1">
                        <span>Other issues need attention.</span>
                        <TouchTooltip
                            placement="bottom"
                            content={
                                <div className="flex flex-col divide-y divide-default-200">
                                    {unmappedErrors.map(([path, message]) => (
                                        <div key={path} className="py-1 first:pt-0 last:pb-0">
                                            {describeUnmappedError(path, message)}
                                        </div>
                                    ))}
                                </div>
                            }
                        >
                            <FontAwesomeIcon icon={faInfoCircle} className="cursor-help"/>
                        </TouchTooltip>
                    </div>
                )}
            </div>
        </Alert>
    );
}
