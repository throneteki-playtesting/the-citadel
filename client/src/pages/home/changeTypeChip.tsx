import classNames from "classnames";
import { IPlaytestCard } from "common/models/cards";
import { BaseElementProps } from "../../types";
import { useMemo } from "react";
import { isPreview } from "common/utils";
import { changeTypeClasses } from "../../constants";

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
                "tracking-wide uppercase font-sans border p-1 text-center block min-w-fit",
                changeTypeClasses[changeType],
                className
            )}
        >
            {changeType}
        </span>
    );
};
type ChangeTypeChipProps = {
    card: IPlaytestCard;
} & Omit<BaseElementProps, "children">;

export default ChangeTypeChip;
