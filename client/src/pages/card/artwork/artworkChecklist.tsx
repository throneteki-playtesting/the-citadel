import { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircle, faCircleCheck } from "@fortawesome/free-regular-svg-icons";
import { faListCheck } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { artworkRequirements, IArtist, IArtworkProgress } from "common/models/artwork";
import { artworkPrepMeta } from "../../../constants";
import StatusNotice from "../../../components/statusNotice";

/**
 * What the artwork still needs, ticked off as it is gathered. Deliberately says nothing about the status -
 * where the track lands is settled at the point of saving, and repeating it here only invites the two to
 * be read as one thing.
 */
export default function ArtworkChecklist({ artwork, artists }: ArtworkChecklistProps) {
    const requirements = artworkRequirements(artwork, artists);
    // Every tweak sits on one line rather than a row each - prep is advisory, and a list of six chores
    // reading as loudly as the work which actually gates the artwork gets the two confused
    const prep = artwork.prep ?? [];
    const isPrepDone = prep.every((entry) => entry.done);
    const isDone = requirements.every((requirement) => requirement.done) && isPrepDone;

    return (
        <StatusNotice
            icon={isDone ? faCircleCheck : faListCheck}
            tone={isDone ? "success" : "neutral"}
            label="Artwork checklist"
            detail={
                <ul className="flex flex-col gap-1">
                    {requirements.map(({ label, done }) => (
                        <ChecklistRow key={label} done={done}>
                            {label}
                        </ChecklistRow>
                    ))}
                    {prep.length > 0 && (
                        <ChecklistRow done={isPrepDone}>
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
                </ul>
            }
        />
    );
}

function ChecklistRow({ done, children }: { done: boolean; children: ReactNode }) {
    return (
        <li className="flex items-start gap-1.5">
            <FontAwesomeIcon
                icon={done ? faCircleCheck : faCircle}
                className={classNames("shrink-0 mt-0.5", done ? "text-success" : "text-foreground/30")}
            />
            <span className={classNames("min-w-0", done && "text-foreground/40")}>{children}</span>
        </li>
    );
}

type ArtworkChecklistProps = {
    artwork: IArtworkProgress;
    artists: IArtist[];
};
