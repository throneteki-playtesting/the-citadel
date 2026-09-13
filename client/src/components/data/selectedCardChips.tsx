import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import { Chip } from "@heroui/react";
import { Code } from "common/models/cards";
import { useSearchTDBCardsQuery } from "../../api/thronesdb";
import CardBadge from "../cardBadge";
import { BaseElementProps } from "../../types";
import { EASE_STANDARD } from "../../constants";

const ROW_TRANSITION = { duration: 0.2, ease: EASE_STANDARD } as const;

/** The chips for whichever printed card codes are selected, pulled out of `CardMultiSelect` so a
 *  caller can place them above the picker (see SelectedTagChips for the Rewards/Punishment analog). */
export default function SelectedCardChips({
    className,
    style,
    value,
    onChange,
    isDisabled,
    emptyLabel
}: SelectedCardChipsProps) {
    const { data } = useSearchTDBCardsQuery(
        { filter: { code: { $in: value as Code[] } }, page: 1, perPage: value.length || 1 },
        { skip: value.length === 0 }
    );

    if (value.length === 0) {
        // `min-h-6` matches the chips' own height, so the section reads the same height whether or
        // not anything's selected - it only grows past that once chips wrap onto a second line.
        return emptyLabel ? (
            <span
                className={classNames("flex min-h-6 items-center text-xs text-foreground/40", className)}
                style={style}
            >
                {emptyLabel}
            </span>
        ) : null;
    }

    return (
        <div className={classNames("flex min-h-6 flex-wrap items-center gap-1", className)} style={style}>
            <AnimatePresence initial={false}>
                {value.map((code) => {
                    const card = data?.items.find((c) => c.code === code);
                    return (
                        <motion.div
                            key={code}
                            layout
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={ROW_TRANSITION}
                        >
                            {card ? (
                                <CardBadge
                                    faction={card.faction}
                                    type={card.type}
                                    name={card.label}
                                    imageUrl={card.imageUrl}
                                    onRemove={isDisabled ? undefined : () => onChange(value.filter((v) => v !== code))}
                                />
                            ) : (
                                <Chip size="sm" variant="flat">
                                    {code}
                                </Chip>
                            )}
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

type SelectedCardChipsProps = Omit<BaseElementProps, "children"> & {
    value: string[];
    onChange: (value: string[]) => void;
    isDisabled?: boolean;
    /** Shown in place of the chip row when nothing is selected, eg. "No comparable cards selected." */
    emptyLabel?: string;
};
