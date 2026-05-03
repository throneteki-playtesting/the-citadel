import classNames from "classnames";
import { IPlaytestCard, NoteType } from "common/models/cards";
import { BaseElementProps } from "../../types";
import { useMemo } from "react";
import { isPreview } from "common/utils";

type ChangeType = NoteType | "new" | "draft" | "preview";
const ChangeTypeChip = ({ card, className, style }: ChangeTypeChipProps) => {
    const changeType = useMemo(() => {
        if (card.draft) {
            return "draft";
        }
        if (card.note) {
            return card.note.type;
        }
        if (isPreview(card)) {
            return "preview";
        }
        return "new";
    }, [card]);

    return (
        <span
            style={style}
            className={classNames(
                "tracking-wide uppercase border p-1 text-center block min-w-fit",
                classes[changeType],
                className
            )}
        >
            {changeType}
        </span>
    );
};
type ChangeTypeChipProps = {
    card: IPlaytestCard
} & Omit<BaseElementProps, "children">

const classes: Record<ChangeType, string> = {
    new: "border-success-300 bg-success-100 text-success-700",
    draft: "border-secondary-300 bg-secondary-100 text-secondary-700",
    preview: "border-secondary-300 bg-secondary-100 text-secondary-700",
    updated: "border-secondary-300 bg-secondary-100 text-secondary-700",
    reworked: "border-warning-300 bg-warning-100 text-warning-700",
    replaced: "border-danger-300 bg-danger-100 text-danger-700"
};

export default ChangeTypeChip;