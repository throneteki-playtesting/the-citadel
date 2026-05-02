import classNames from "classnames";
import { NoteType } from "common/models/cards";
import { BaseElementProps } from "../../types";

const NoteTypeChip = ({ noteType, className, style }: NoteTypeChipProps) => {
    return (
        <span
            style={style}
            className={classNames(
                "tracking-wide uppercase border p-1 text-center block min-w-fit",
                classes[noteType],
                className
            )}
        >
            {noteType}
        </span>
    );
};
type NoteTypeChipProps = {
    noteType: NoteType
} & Omit<BaseElementProps, "children">

const classes: Record<NoteType, string> = {
    updated: "border-secondary-300 bg-secondary-100 text-secondary-700",
    reworked: "border-warning-300 bg-warning-100 text-warning-700",
    replaced: "border-danger-300 bg-danger-100 text-danger-700"
};

export default NoteTypeChip;