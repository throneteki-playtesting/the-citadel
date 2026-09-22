import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { Code } from "common/models/cards";
import { useSearchTDBCardsQuery } from "../../api/thronesdb";
import { BaseElementProps } from "../../types";
import { EASE_STANDARD } from "../../constants";

const ROW_TRANSITION = { duration: 0.2, ease: EASE_STANDARD } as const;

/** The selected printed card codes, drawn as their own images in a flex row rather than name chips -
 *  pulled out of the picker so a caller can place them above it (see CardImageGrid for the picker). */
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

    if (value.length === 0) {
        return emptyLabel ? (
            <span
                className={classNames("flex min-h-16 items-center text-xs text-foreground/40", className)}
                style={style}
            >
                {emptyLabel}
            </span>
        ) : null;
    }

    return (
        <div className={classNames("flex min-h-16 flex-wrap items-center gap-2", className)} style={style}>
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
                            className="relative"
                        >
                            {card ? (
                                <img
                                    src={card.imageUrl}
                                    alt={card.label}
                                    title={card.label}
                                    className={classNames("h-16 w-auto rounded-md", card.type === "plot" && "rotate-90")}
                                />
                            ) : (
                                <div className="flex h-16 w-12 items-center justify-center rounded-md border border-content3 text-xxs text-foreground/40">
                                    {code}
                                </div>
                            )}
                            {!isDisabled && (
                                <button
                                    type="button"
                                    aria-label={`Remove ${card?.label ?? code}`}
                                    onClick={() => onChange(value.filter((v) => v !== code))}
                                    className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-danger text-white cursor-pointer"
                                >
                                    <FontAwesomeIcon icon={faXmark} className="text-[0.55rem]" />
                                </button>
                            )}
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

type SelectedCardImagesProps = Omit<BaseElementProps, "children"> & {
    value: string[];
    onChange: (value: string[]) => void;
    isDisabled?: boolean;
    /** Shown in place of the image row when nothing is selected, eg. "No comparable cards selected." */
    emptyLabel?: string;
};
