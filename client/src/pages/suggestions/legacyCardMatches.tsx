import { Link } from "react-router-dom";
import { faLink, faScroll } from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import { CardPreview } from "@agot/card-preview";
import {
    cardMatchKey,
    cardMatchLabel,
    ICardSuggestion,
    ISuggestionCardMatch,
    ProjectCardRef
} from "common/models/cards";
import { escapeRegExp, renderPlaytestingCard } from "common/utils";
import { useGetSuggestionCardMatchesQuery } from "../../api";
import StatusNotice from "../../components/statusNotice";
import CardFocusThumbnail from "../../components/cardFocusThumbnail";
import { suggestionFilterToParams } from "./suggestionFilterUrl";

const THUMBNAIL_WIDTH_REM = 3.5;

/** The card as it first entered its project - the synced image where there is one, and otherwise drawn from its
 *  data. Zoomable either way. */
function MatchThumbnail({ match }: { match: ISuggestionCardMatch }) {
    const card = match.firstVersion;
    const isPlot = card.type === "plot";
    const imageUrl = card._metadata?.imageUrl;
    return (
        <CardFocusThumbnail
            imageUrl={imageUrl}
            alt={`${cardMatchLabel(match)} - ${card.name}`}
            isPlot={isPlot}
            widthRem={THUMBNAIL_WIDTH_REM}
        >
            {!imageUrl && (
                <CardPreview
                    card={renderPlaytestingCard(card)}
                    orientation={isPlot ? "horizontal" : "vertical"}
                    rounded
                />
            )}
        </CardFocusThumbnail>
    );
}

function CardPageLink({ match }: { match: ProjectCardRef }) {
    // A draft slot's versions are separate cards - straight to the one matched, not whichever is latest
    const query = match.version ? `?version=${match.version}` : "";
    return (
        <Link
            to={`/project/${match.project.number}/${match.number}${query}`}
            className="font-semibold text-primary hover:underline"
        >
            {cardMatchLabel(match)}
        </Link>
    );
}

// The rest of the legacy suggestions this card could equally have come from, on the browse page
function othersLink(suggestion: ICardSuggestion) {
    const params = new URLSearchParams({
        all: "true",
        ...suggestionFilterToParams({
            legacy: true,
            developed: true,
            name: { $regex: `(?i)${escapeRegExp(suggestion.card.name)}` },
            faction: [suggestion.card.faction],
            type: [suggestion.card.type]
        })
    });
    return `/suggestions?${params.toString()}`;
}

/** For a legacy suggestion, the project cards it may already have been developed as - linking it to one is
 *  offered among LegacySuggestionPanel's options. MANAGE_SUGGESTIONS_ARCHIVE only. */
export default function LegacyCardMatches({ suggestion, className }: LegacyCardMatchesProps) {
    const { data } = useGetSuggestionCardMatchesQuery(suggestion.id!);

    const linkedTo = data?.linkedTo;
    const matches = data?.matches ?? [];

    // Appears once looked up rather than holding room for it - most legacy suggestions have no match
    return (
        <AnimatePresence initial={false}>
            {(linkedTo || matches.length > 0) && (
                <motion.div
                    key="card-matches"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={className}
                >
                    <div className="flex flex-col gap-2">
                        {linkedTo && (
                            <StatusNotice
                                icon={faLink}
                                iconPosition="title"
                                color="info"
                                label="Linked"
                                detail={
                                    <>
                                        Developed as <CardPageLink match={linkedTo} /> - it's archived as used there
                                        once {linkedTo.project.code} begins.
                                    </>
                                }
                            />
                        )}
                        {matches.map((match) => (
                            <StatusNotice
                                key={cardMatchKey(match)}
                                icon={faScroll}
                                iconPosition="title"
                                color="info"
                                label="Found in the Records"
                                media={<MatchThumbnail match={match} />}
                                detail={
                                    <>
                                        This suggestion
                                        {match.others > 0 && (
                                            <>
                                                {" "}
                                                <Link
                                                    to={othersLink(suggestion)}
                                                    className="text-primary hover:underline"
                                                >
                                                    (and {match.others} other{match.others === 1 ? "" : "s"})
                                                </Link>
                                            </>
                                        )}{" "}
                                        may have already been developed as <CardPageLink match={match} />
                                        {match.firstVersion.name !== suggestion.card.name &&
                                            `, first named ${match.firstVersion.name}`}
                                        . If so, it can be linked to it below.
                                    </>
                                }
                            />
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

type LegacyCardMatchesProps = {
    suggestion: ICardSuggestion;
    className?: string;
};
