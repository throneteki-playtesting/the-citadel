import { ReactNode } from "react";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faArrowRight,
    faBoxArchive,
    faComments,
    faEye,
    faHammer,
    faLink,
    faPencil,
    faStamp,
    faTrash,
    IconDefinition
} from "@fortawesome/free-solid-svg-icons";
import { cardMatchKey, cardMatchLabel, ICardSuggestion, ISuggestionCardMatch } from "common/models/cards";
import { useGetSuggestionCardMatchesQuery } from "../../api";
import SectionTitle from "../../components/sectionTitle";
import { UserRow } from "../../components/userAvatar";
import PointList, { Point } from "./pointList";

const MEANINGS: Point[] = [
    {
        icon: faEye,
        text: "Anyone can find it, and like or dislike it - which is a good way to say it deserves finishing."
    },
    { icon: faStamp, text: "It can't be approved until it has been completed." },
    {
        icon: faComments,
        text: "It has no Discord thread yet. Completing it posts one, like any newly submitted suggestion."
    }
];

function linkDetail(match: ISuggestionCardMatch) {
    return match.project.isDraft
        ? `It was developed as ${cardMatchLabel(match)} - archive it as used there once ${match.project.code} begins.`
        : `It was developed as ${cardMatchLabel(match)} - archive it as used there, closing it to further edits.`;
}

// The panel's stripes are its background, and a translucent tint laid over them lets them show through - this
// gives the tint something solid to sit on, so it keeps its colour without the stripes running across it
function OpaqueBacking({ className, children }: { className?: string; children: ReactNode }) {
    return <div className={classNames("bg-content1", className)}>{children}</div>;
}

const OPTION_TONES = {
    primary: {
        tile: "border-primary/40 hover:border-primary focus-visible:ring-primary",
        tint: "bg-primary/5 group-hover:bg-primary/10",
        icon: "text-primary bg-primary/15",
        accent: "text-primary"
    },
    success: {
        tile: "border-success/40 hover:border-success focus-visible:ring-success",
        tint: "bg-success/5 group-hover:bg-success/10",
        icon: "text-success bg-success/15",
        accent: "text-success"
    },
    danger: {
        tile: "border-danger/40 hover:border-danger focus-visible:ring-danger",
        tint: "bg-danger/5 group-hover:bg-danger/10",
        icon: "text-danger bg-danger/15",
        accent: "text-danger"
    }
} as const;

// Up to three side by side - beyond that (more than one card to link), they wrap in twos
const OPTION_COLUMNS: Record<number, string> = { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3" };

/** One way forward, as the thing to press - a title saying what it does, and a line on what follows */
function OptionTile({
    icon,
    title,
    detail,
    tone = "primary",
    onPress
}: {
    icon: IconDefinition;
    title: string;
    detail: string;
    tone?: keyof typeof OPTION_TONES;
    onPress: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onPress}
            className={classNames(
                "group relative w-full h-full flex flex-col gap-1.5 p-3 rounded-md border bg-content1 text-left shadow-sm cursor-pointer",
                "transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98] active:shadow-sm",
                "outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                OPTION_TONES[tone].tile
            )}
        >
            <span
                className={classNames(
                    "absolute inset-0 rounded-md pointer-events-none transition-colors",
                    OPTION_TONES[tone].tint
                )}
            />
            <span className="relative flex items-center gap-2">
                <span
                    className={classNames(
                        "shrink-0 grid place-items-center size-7 rounded-full text-xs",
                        OPTION_TONES[tone].icon
                    )}
                >
                    <FontAwesomeIcon icon={icon} />
                </span>
                <span
                    className={classNames(
                        "flex-1 min-w-0 font-cinzel tracking-wide text-sm",
                        OPTION_TONES[tone].accent
                    )}
                >
                    {title}
                </span>
                <FontAwesomeIcon
                    icon={faArrowRight}
                    className={classNames(
                        "shrink-0 text-xs transition-transform duration-150 group-hover:translate-x-0.5",
                        OPTION_TONES[tone].accent
                    )}
                />
            </span>
            <span className="relative text-xs text-foreground/60">{detail}</span>
        </button>
    );
}

/** Fills the detail page's answer column for a legacy suggestion, which has no answers to show - a
 *  deliberately unfinished look, saying what legacy means and what can be done with it */
export default function LegacySuggestionPanel({
    suggestion,
    canComplete,
    onComplete,
    canDelete,
    onDelete,
    canLink,
    onLink,
    className
}: LegacySuggestionPanelProps) {
    const usedIn = suggestion.archived?.project;
    // Shared with LegacyCardMatches' notice above, which shows the same cards
    const { data: cardMatches } = useGetSuggestionCardMatchesQuery(suggestion.id!, { skip: !canLink || !!usedIn });

    const matches = (canLink && cardMatches?.matches) || [];

    const options = [
        ...matches.map((match) => (
            <OptionTile
                key={cardMatchKey(match)}
                icon={faLink}
                title={`Link to ${cardMatchLabel(match)}`}
                detail={linkDetail(match)}
                tone="success"
                onPress={() => onLink(match)}
            />
        )),
        canComplete && (
            <OptionTile
                key="complete"
                icon={faPencil}
                title="Complete it"
                detail="Answer its questions and post it to Discord - bringing its old forum thread across, if it has one."
                onPress={onComplete}
            />
        ),
        // An old design nobody means to finish is better gone than left waiting forever
        canDelete && (
            <OptionTile
                key="delete"
                icon={faTrash}
                title="Delete it"
                detail="Remove it for good - for a design nobody means to finish."
                tone="danger"
                onPress={onDelete}
            />
        )
    ].filter(Boolean);

    return (
        <div
            className={classNames(
                "relative overflow-hidden rounded-lg border-2 border-dashed border-primary/40 p-4 sm:p-5 flex flex-col gap-4",
                "bg-[repeating-linear-gradient(-45deg,hsl(var(--heroui-primary)/0.06)_0_12px,transparent_12px_24px)]",
                className
            )}
        >
            <div className="flex items-start gap-3">
                <OpaqueBacking className="shrink-0 rounded-full">
                    <div className="flex items-center justify-center size-10 rounded-full bg-primary/15 text-primary">
                        <FontAwesomeIcon icon={faHammer} className="text-lg" />
                    </div>
                </OpaqueBacking>
                <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-cinzel uppercase tracking-widest text-sm text-primary">
                        Recovered from the old archives
                    </span>
                    <p className="text-sm text-foreground/70">
                        This design was carried over from the design team's original suggestion spreadsheet. Only the
                        card itself made the journey - the questions every suggestion now answers were never asked of
                        it.
                    </p>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <SectionTitle size="sm">What legacy means</SectionTitle>
                <PointList points={MEANINGS} />
            </div>

            {usedIn ? (
                <div className="flex items-start gap-2.5 rounded-md border border-content3 bg-content1 p-3 text-sm text-foreground/70">
                    <FontAwesomeIcon icon={faBoxArchive} className="shrink-0 mt-0.5 text-foreground/40" />
                    <span>
                        It has already been taken into {usedIn.code} as card #{usedIn.number}, so there is nothing left
                        to complete.
                    </span>
                </div>
            ) : (
                <div className="flex flex-col gap-3 border-t border-dashed border-primary/30 pt-4">
                    <SectionTitle size="sm">What's next?</SectionTitle>
                    {!canComplete && (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground/60">
                            Waiting on
                            <UserRow discordId={suggestion.createdBy} className="shrink-0 max-w-full" />
                            to complete it.
                        </span>
                    )}
                    {options.length > 0 && (
                        <div
                            className={classNames(
                                "grid grid-cols-1 gap-2",
                                OPTION_COLUMNS[options.length] ?? OPTION_COLUMNS[2]
                            )}
                        >
                            {options}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

type LegacySuggestionPanelProps = {
    suggestion: ICardSuggestion;
    canComplete: boolean;
    onComplete: () => void;
    canDelete: boolean;
    /** Asks first - the caller's own delete confirmation, the same as its header's Delete */
    onDelete: () => void;
    /** Whether it can be linked to a project card it was already developed as - MANAGE_SUGGESTIONS_ARCHIVE */
    canLink: boolean;
    /** Opens the caller's link modal for that card - the same one LegacyCardMatches' "and N others" opens */
    onLink: (match: ISuggestionCardMatch) => void;
    className?: string;
};
