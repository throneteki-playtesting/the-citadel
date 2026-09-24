import { useDeferredValue, useMemo, useState } from "react";
import { DeepPartial } from "common/types";
import { ICardSuggestion } from "common/models/cards";
import { Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { useGetSuggestionsQuery } from "../../api";
import { useAuth } from "../../hooks/useAuth";
import CardGrid from "../../components/cardGrid";
import SortSelect from "../../components/sortSelect";
import SuggestionCardPreview from "../../components/suggestionCardPreview";
import {
    isSuggestionFilterActive,
    SuggestionFilterSearchBar,
    SuggestionFilterValue
} from "../../components/data/suggestionFilter";
import { EMPTY_SUGGESTION_FILTER } from "../../components/data/suggestionFilter/types";
import { reorderTransition } from "../../constants";
import { SortOption, sortOptions } from "./suggestionSortOptions";
import useFilteredSuggestionList, { useDistinctTraits } from "./useFilteredSuggestionList";

// A draft card, click-only - unlike SuggestionCardLink there's no reactions/badges to show (nobody
// but the owner can even see a draft), and clicking hands the draft up rather than opening its own
// nested editor - the caller closes this modal and opens the editor in its place.
function DraftCard({ suggestion, onSelect }: { suggestion: ICardSuggestion; onSelect: () => void }) {
    const isPlot = suggestion.card.type === "plot";
    return (
        <div className={classNames("w-full", isPlot ? "aspect-[333/240]" : "aspect-[240/333]")}>
            <button
                type="button"
                onClick={onSelect}
                className="group block w-full h-full hover:z-20 relative cursor-pointer text-left"
            >
                <div className="w-full h-full scale-[0.98] transition-transform duration-200 ease-out group-hover:scale-100">
                    <SuggestionCardPreview
                        suggestion={suggestion}
                        orientation={isPlot ? "horizontal" : "vertical"}
                        rounded
                    />
                </div>
            </button>
        </div>
    );
}

// Search/filter/sort here are entirely local to the modal, not url-backed - opening this isn't a
// navigable place, just a quick way to find one draft among several and jump into its editor.
export default function MyDraftsModal({ isOpen, onClose, onSelectDraft }: MyDraftsModalProps) {
    const { user } = useAuth();
    const { data, isLoading } = useGetSuggestionsQuery({ filter: { draft: true } }, { skip: !isOpen });
    const drafts = useMemo(() => data?.items ?? [], [data?.items]);

    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<SuggestionFilterValue>(EMPTY_SUGGESTION_FILTER);
    const [sortBy, setSortBy] = useState<SortOption>("updated");

    const deferredSearch = useDeferredValue(search.trim());
    const isFilterActive = isSuggestionFilterActive(filter);
    const effectiveSearch = isFilterActive ? "" : deferredSearch;

    const distinctTraits = useDistinctTraits(drafts);
    // Every draft is the viewer's own - see canViewSuggestion
    const distinctUsers = useMemo(
        () => (user ? [{ discordId: user.discordId, displayname: user.displayname }] : []),
        [user]
    );
    const filtered = useFilteredSuggestionList(drafts, {
        filter,
        search: effectiveSearch,
        sortBy,
        currentUserId: user?.discordId
    });

    const isEmpty = !isLoading && filtered.length === 0;

    const onSelect = (suggestion: DeepPartial<ICardSuggestion>) => {
        onClose();
        onSelectDraft(suggestion);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="5xl" placement="center" scrollBehavior="inside">
            <ModalContent>
                <ModalHeader>My Drafts</ModalHeader>
                <ModalBody className="pb-6">
                    <div className="text-sm text-foreground/70 italic -mt-2">
                        Your personal, unsubmitted suggestions - tap one to continue editing it.
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="hidden sm:block flex-1" />
                        <SuggestionFilterSearchBar
                            search={search}
                            onSearchChange={setSearch}
                            filter={filter}
                            onFilterChange={setFilter}
                            traits={distinctTraits}
                            users={distinctUsers}
                            isDisabled={isLoading}
                            className="w-full sm:w-auto sm:min-w-40"
                        />
                        <SortSelect
                            options={sortOptions}
                            value={sortBy}
                            isDisabled={isLoading}
                            onChange={setSortBy}
                            className="w-full sm:w-44"
                        />
                    </div>
                    {isLoading ? (
                        <CardGrid cards={[]} isLoading>
                            {() => null}
                        </CardGrid>
                    ) : isEmpty ? (
                        <div className="p-8 text-center text-default-400">
                            {effectiveSearch ? (
                                <>No drafts match &ldquo;{effectiveSearch}&rdquo;.</>
                            ) : (
                                "No drafts match the current filters."
                            )}
                        </div>
                    ) : (
                        <div
                            className={classNames(
                                "grid gap-1",
                                "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
                            )}
                        >
                            <AnimatePresence initial={false} mode="popLayout">
                                {filtered.map((suggestion) => (
                                    <motion.div
                                        key={suggestion.id}
                                        layout
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={reorderTransition}
                                    >
                                        <DraftCard suggestion={suggestion} onSelect={() => onSelect(suggestion)} />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}

type MyDraftsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSelectDraft: (suggestion: DeepPartial<ICardSuggestion>) => void;
};
