import { HTMLAttributes, ReactNode, Ref } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircle, faCircleCheck } from "@fortawesome/free-regular-svg-icons";
import { faListCheck } from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import { EASE_STANDARD } from "../constants";

const ROW_TRANSITION = { duration: 0.25, ease: EASE_STANDARD } as const;

/**
 * The one way a lane's outstanding work is drawn, so a card's own checklist and the project list's dots
 * cannot come to disagree about what is left. A lane supplies its own rows; everything about how they look lives here.
 */
export default function Checklist({ children }: { children: ReactNode }) {
    return (
        <ul className="flex flex-col -mt-1">
            <AnimatePresence initial={false}>{children}</AnimatePresence>
        </ul>
    );
}

/** Rows are animated to help transition checklist items being added/removed */
export function ChecklistRow({ done, children }: { done: boolean; children: ReactNode }) {
    return (
        <motion.li
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={ROW_TRANSITION}
        >
            <div className="flex items-start gap-1.5 pt-1">
                <ChecklistMark done={done} className="mt-0.5" />
                <span className={classNames("min-w-0", done && "text-foreground/40")}>{children}</span>
            </div>
        </motion.li>
    );
}

/** The same tick a row carries, on its own - a filled circle for done, an empty one for not */
export function ChecklistMark({ done, className }: { done: boolean; className?: string }) {
    return (
        <FontAwesomeIcon
            icon={done ? faCircleCheck : faCircle}
            className={classNames("shrink-0", done ? "text-success" : "text-foreground/30", className)}
        />
    );
}

/**
 * The checklist compressed to one dot per task, for a list row with no room for labels. Sized to `max`
 * rather than to the row's own tasks, so the strip holds the widest it could ever be and columns stay aligned.
 */
export function ChecklistDots({ tasks, max = tasks.length, className, ...props }: ChecklistDotsProps) {
    return (
        <div
            {...props}
            className={classNames("shrink-0 flex items-center justify-start gap-1 text-xs cursor-help", className)}
            style={{ width: `calc(1rem + ${max}rem)` }}
            aria-label={`${tasks.filter((done) => !done).length} of ${tasks.length} tasks remaining`}
        >
            <FontAwesomeIcon icon={faListCheck} className="w-4 text-foreground/40" />
            {tasks.map((done, task) => (
                <ChecklistMark key={task} done={done} className="w-3" />
            ))}
        </div>
    );
}

type ChecklistDotsProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    tasks: boolean[];
    /** The most dots this list can ever draw, so a column of rows stays aligned. Defaults to what it has */
    max?: number;
    ref?: Ref<HTMLDivElement>;
};
