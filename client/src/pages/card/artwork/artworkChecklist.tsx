import { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircle, faCircleCheck } from "@fortawesome/free-regular-svg-icons";
import { faListCheck } from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import {
    artworkRequirements,
    IArtist,
    IArtworkPrep,
    IArtworkProgress,
    IArtworkRequirement,
    isPrepDone,
    remainingTasks,
    visiblePrep
} from "common/models/artwork";
import { artworkPrepMeta } from "../../../constants";
import StatusNotice from "../../../components/statusNotice";

const ROW_TRANSITION = { duration: 0.25, ease: [0.65, 0, 0.35, 1] } as const;

/**
 * What the artwork still needs, ticked off as it is gathered. Deliberately says nothing about the status -
 * where the track lands is settled at the point of saving, and repeating it here only invites the two to
 * be read as one thing.
 */
export default function ArtworkChecklist({ artwork, artists }: ArtworkChecklistProps) {
    const requirements = artworkRequirements(artwork, artists);
    const prep = visiblePrep(artwork);
    const isDone = remainingTasks(requirements, prep) === 0;

    return (
        <StatusNotice
            icon={isDone ? faCircleCheck : faListCheck}
            tone={isDone ? "success" : "neutral"}
            label="Artwork checklist"
            detail={<ArtworkChecklistItems requirements={requirements} prep={prep} />}
        />
    );
}

/** The checklist without its notice, shared with the project list so both read the same */
export function ArtworkChecklistItems({ requirements, prep }: ArtworkChecklistItemsProps) {
    return (
        <ul className="flex flex-col -mt-1">
            <AnimatePresence initial={false}>
                {requirements.map(({ label, done }) => (
                    <ChecklistRow key={label} done={done}>
                        {label}
                    </ChecklistRow>
                ))}
                {prep.length > 0 && (
                    <ChecklistRow key="prep" done={isPrepDone(prep)}>
                        Prepare the artwork
                        <span className="text-foreground/40">
                            {prep.map(({ flag, done }, index) => (
                                <span key={flag}>
                                    {index === 0 ? " - " : ", "}
                                    <span className={classNames(done && "line-through text-foreground/25")}>
                                        {artworkPrepMeta[flag].label}
                                    </span>
                                </span>
                            ))}
                        </span>
                    </ChecklistRow>
                )}
            </AnimatePresence>
        </ul>
    );
}

/** Rows are animated to help transition checklist items being added/removed */
function ChecklistRow({ done, children }: { done: boolean; children: ReactNode }) {
    return (
        <motion.li
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={ROW_TRANSITION}
        >
            <div className="flex items-start gap-1.5 pt-1">
                <FontAwesomeIcon
                    icon={done ? faCircleCheck : faCircle}
                    className={classNames("shrink-0 mt-0.5", done ? "text-success" : "text-foreground/30")}
                />
                <span className={classNames("min-w-0", done && "text-foreground/40")}>{children}</span>
            </div>
        </motion.li>
    );
}

type ArtworkChecklistProps = {
    artwork: IArtworkProgress;
    artists: IArtist[];
};

type ArtworkChecklistItemsProps = {
    requirements: IArtworkRequirement[];
    prep: IArtworkPrep[];
};
