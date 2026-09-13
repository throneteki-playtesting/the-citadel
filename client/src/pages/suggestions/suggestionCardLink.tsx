import { useState } from "react";
import { addToast } from "@heroui/react";
import { ICardSuggestion } from "common/models/cards";
import Permission from "common/models/permissions";
import classNames from "classnames";
import PermissionedLink from "../../components/permissionedLink";
import SuggestionCard from "./suggestionCard";
import EditSuggestionModal from "./editSuggestionModal";

// The Link + aspect-ratio + hover-scale wrapper ProjectContent gives ProjectContentCard - kept
// separate from SuggestionCard itself so the card stays a pure visual.

// The scale lives on an INNER div, not the link itself - the link (the actual hit-target) always
// fills its container exactly, or a real hand tremor at the card's edge flickers :hover on and off.
export default function SuggestionCardLink({ suggestion, showLikesBadge }: SuggestionCardLinkProps) {
    // Mirrors projectContent.tsx's own per-card aspect swap - a plot stays landscape at the same
    // column width, so it ends up shorter next to non-plots, not narrower.
    const isPlot = suggestion.card.type === "plot";
    // While in draft, only its editor exists - a draft card opens straight into it instead of
    // navigating. The suggestion list only ever returns your OWN drafts (restrictDraftVisibility).
    const [isEditingDraft, setIsEditingDraft] = useState(false);

    return (
        <div className={classNames("w-full", isPlot ? "aspect-[333/240]" : "aspect-[240/333]")}>
            {suggestion.draft ? (
                <>
                    <button
                        type="button"
                        onClick={() => setIsEditingDraft(true)}
                        className="group block w-full h-full hover:z-20 relative cursor-pointer text-left"
                    >
                        <div className="w-full h-full scale-[0.98] transition-transform duration-200 ease-out group-hover:scale-100">
                            <SuggestionCard suggestion={suggestion} showLikesBadge={showLikesBadge} />
                        </div>
                    </button>
                    <EditSuggestionModal
                        isOpen={isEditingDraft}
                        suggestion={suggestion}
                        onClose={() => setIsEditingDraft(false)}
                        onSave={(saved) =>
                            addToast({
                                title: "Successfully saved",
                                color: "success",
                                description: `"${saved.card.name}" suggestion has been saved`
                            })
                        }
                    />
                </>
            ) : (
                <PermissionedLink
                    to={`/suggestions/${suggestion.id}`}
                    requires={Permission.READ_SUGGESTIONS}
                    className="group block w-full h-full hover:z-20 relative"
                >
                    <div className="w-full h-full scale-[0.98] transition-transform duration-200 ease-out group-hover:scale-100">
                        <SuggestionCard suggestion={suggestion} showLikesBadge={showLikesBadge} />
                    </div>
                </PermissionedLink>
            )}
        </div>
    );
}

type SuggestionCardLinkProps = {
    suggestion: ICardSuggestion;
    /** Only true from the All Suggestions grid while sorted by Likes - see suggestionCard.tsx. */
    showLikesBadge?: boolean;
};
