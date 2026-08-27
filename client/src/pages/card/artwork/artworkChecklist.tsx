import { faCircleCheck } from "@fortawesome/free-regular-svg-icons";
import { faListCheck } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import {
    artworkRequirements,
    IArtist,
    IArtworkPrep,
    IArtworkProgress,
    IArtworkRequirement,
    isChecklistDone,
    isPrepDone,
    visiblePrep
} from "common/models/artwork";
import { artworkPrepMeta } from "../../../constants";
import StatusNotice from "../../../components/statusNotice";
import Checklist, { ChecklistRow } from "../../../components/checklist";

// What the artwork still needs, ticked off as it is gathered - says nothing about the status itself
export default function ArtworkChecklist({ artwork, artists }: ArtworkChecklistProps) {
    const requirements = artworkRequirements(artwork, artists);
    const prep = visiblePrep(artwork);
    const isDone = isChecklistDone(artwork, artists);

    return (
        <StatusNotice
            icon={isDone ? faCircleCheck : faListCheck}
            color={isDone ? "success" : "neutral"}
            label="Artwork checklist"
            detail={<ArtworkChecklistItems requirements={requirements} prep={prep} />}
        />
    );
}

/** The checklist without its notice, shared with the project list so both read the same */
export function ArtworkChecklistItems({ requirements, prep }: ArtworkChecklistItemsProps) {
    return (
        <Checklist>
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
        </Checklist>
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
