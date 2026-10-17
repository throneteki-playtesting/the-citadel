import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { Code } from "common/models/cards";
import { useSearchTDBCardsQuery } from "../../api/thronesdb";
import CardImage from "../cardImage";
import { BaseElementProps } from "../../types";
import { EASE_STANDARD } from "../../constants";

const ROW_TRANSITION = { duration: 0.2, ease: EASE_STANDARD } as const;

/** Selected printed cards, shown as a 6-per-row grid (see CardPickerDropdown for the picker). A plot
 *  card spans col-span-7, not 5 - its physical proportions turned sideways, not double width. */
export default function SelectedCardImages({
    className,
    style,
    value,
    onChange,
    isDisabled,
    emptyLabel
}: SelectedCardImagesProps) {
    const { data } = useSearchTDBCardsQuery(
        { filter: { code: { $in: value as Code[] } }, page: 1, perPage: value.length || 1 },
        { skip: value.length === 0 }
    );

    const [orientationCache, setOrientationCache] = useState<Record<string, "vertical" | "horizontal">>({});
    useEffect(() => {
        if (!data?.items.length) {
            return;
        }
        setOrientationCache((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const card of data.items) {
                const orientation = card.type === "plot" ? "horizontal" : "vertical";
                if (card.code && next[card.code] !== orientation) {
                    next[card.code] = orientation;
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [data]);

    if (value.length === 0 && !emptyLabel) {
        return null;
    }

    return (
        <motion.div layout transition={ROW_TRANSITION} className={className} style={style}>
            {value.length === 0 ? (
                <span className="flex items-center py-2 text-xs text-foreground/40">{emptyLabel}</span>
            ) : (
                <div className="grid grid-cols-[repeat(30,minmax(0,1fr))] items-center gap-3 py-1">
                    <AnimatePresence initial={false} mode="popLayout">
                        {value.map((code) => {
                            const orientation = orientationCache[code];
                            return (
                                <motion.div
                                    key={code}
                                    layout
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={ROW_TRANSITION}
                                    className={classNames(
                                        "relative w-full",
                                        orientation === "horizontal" ? "col-span-7" : "col-span-5"
                                    )}
                                >
                                    <CardImage card={code as Code} orientation={orientation} className="rounded-md" />
                                    {!isDisabled && (
                                        <button
                                            type="button"
                                            aria-label={`Remove ${code}`}
                                            onClick={() => onChange(value.filter((v) => v !== code))}
                                            className="absolute -right-1.5 -top-1.5 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full border border-content3 bg-content1 text-foreground/60 shadow-sm transition-colors hover:border-danger/50 hover:text-danger"
                                        >
                                            <FontAwesomeIcon icon={faXmark} className="text-xs" />
                                        </button>
                                    )}
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </motion.div>
    );
}

type SelectedCardImagesProps = Omit<BaseElementProps, "children"> & {
    value: string[];
    onChange: (value: string[]) => void;
    isDisabled?: boolean;
    /** Shown in place of the image row when nothing is selected, eg. "No comparable cards selected." */
    emptyLabel?: string;
};
