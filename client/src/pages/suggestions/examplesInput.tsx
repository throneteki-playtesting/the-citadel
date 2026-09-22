import { memo, useRef, useState } from "react";
import { Button, Input } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import { BaseElementProps } from "../../types";
import { EASE_STANDARD } from "../../constants";

const ROW_TRANSITION = { duration: 0.25, ease: EASE_STANDARD } as const;

/** 0-many illustrative example strings for a reward/punishment type - the same simple row-per-entry
 *  add/edit/delete shape as PivotPointsInput, rather than the free-typed chips this used to be. */
const ExamplesInput = memo(function ExamplesInput({ className, style, value, onChange, isDisabled }: ExamplesInputProps) {
    const [draft, setDraft] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const commit = () => {
        const trimmed = draft.trim();
        if (!trimmed) {
            return;
        }
        onChange([...value, trimmed]);
        setDraft("");
    };

    const remove = (index: number) => {
        onChange(value.filter((_, i) => i !== index));
    };

    // Pulls the entry back into the input to be reworded and re-added, rather than editing in place
    const edit = (index: number) => {
        setDraft(value[index]);
        remove(index);
        inputRef.current?.focus();
    };

    return (
        <div className={classNames("flex flex-col gap-2", className)} style={style}>
            <ul className="flex flex-col">
                <AnimatePresence initial={false}>
                    {value.length === 0 && (
                        <motion.li
                            key="empty"
                            className="overflow-hidden"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={ROW_TRANSITION}
                        >
                            <span className="block pb-2 text-xs text-foreground/40">No examples yet.</span>
                        </motion.li>
                    )}
                    {value.map((example, index) => (
                        <motion.li
                            key={`${index}-${example}`}
                            className="overflow-hidden"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={ROW_TRANSITION}
                        >
                            <div className="flex items-center gap-3 rounded-lg border border-content3 bg-content1 p-2.5 mb-2">
                                <span className="min-w-0 flex-1 text-sm">{example}</span>
                                {!isDisabled && (
                                    <div className="flex shrink-0 items-center gap-2">
                                        <motion.button
                                            type="button"
                                            aria-label={`Edit example "${example}"`}
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.9 }}
                                            className="cursor-pointer text-foreground/40 hover:text-foreground"
                                            onClick={() => edit(index)}
                                        >
                                            <FontAwesomeIcon icon={faPencil} />
                                        </motion.button>
                                        <motion.button
                                            type="button"
                                            aria-label={`Remove example "${example}"`}
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.9 }}
                                            className="cursor-pointer text-foreground/40 hover:text-danger"
                                            onClick={() => remove(index)}
                                        >
                                            <FontAwesomeIcon icon={faTrash} />
                                        </motion.button>
                                    </div>
                                )}
                            </div>
                        </motion.li>
                    ))}
                </AnimatePresence>
            </ul>
            <div className="flex gap-2">
                <Input
                    ref={inputRef}
                    className="flex-1 min-w-0"
                    size="sm"
                    value={draft}
                    onValueChange={setDraft}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            commit();
                        }
                    }}
                    placeholder="E.g. Tywin Lannister"
                    isDisabled={isDisabled}
                />
                <Button
                    size="sm"
                    isDisabled={isDisabled || !draft.trim()}
                    onPress={commit}
                    startContent={<FontAwesomeIcon icon={faPlus} />}
                >
                    Add
                </Button>
            </div>
        </div>
    );
});

type ExamplesInputProps = Omit<BaseElementProps, "children"> & {
    value: string[];
    onChange: (value: string[]) => void;
    isDisabled?: boolean;
};

export default ExamplesInput;
