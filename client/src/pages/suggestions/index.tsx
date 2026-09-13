import { ReactNode, useEffect, useMemo, useState } from "react";
import Reveal from "../../components/reveal";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { DeepPartial } from "common/types";
import { ICardSuggestion } from "common/models/cards";
import { useGetSuggestionsFeedQuery } from "../../api";
import Permission from "common/models/permissions";
import EditSuggestionModal from "./editSuggestionModal";
import { addToast, Skeleton } from "@heroui/react";
import HeaderActions from "../../components/actions/headerActions";
import SectionTitle from "../../components/sectionTitle";
import CardGrid from "../../components/cardGrid";
import StatsGrid from "../../components/statsGrid";
import SlidingPages from "../../components/slidingPages";
import ScopedSearchParamsProvider from "../../components/scopedSearchParamsProvider";
import { ScopeParams, useSearchParamsScope } from "../../hooks/useSearchParamsScope";
import SuggestionCardLink from "./suggestionCardLink";
import SuggestionsGrid from "./suggestionsGrid";
import { SortOption } from "./suggestionSortOptions";
import SuggestionSpread from "./suggestionSpread";
import SuggestionApprovalPanel from "./suggestionApprovalPanel";
import { suggestionFilterFromParams, suggestionFilterToParams } from "./suggestionFilterUrl";
import { EMPTY_SUGGESTION_FILTER, SuggestionFilterValue } from "../../components/data/suggestionFilter";
import usePageTitle from "../../hooks/usePageTitle";
import { usePermission } from "../../hooks/usePermission";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faPlus } from "@fortawesome/free-solid-svg-icons";
import LoadingCard from "../../components/loadingCard";
// Every key the "all suggestions" scope might write - declared up front so a cleared field's key
// is dropped rather than left stale, same convention projectContent.tsx/projectArtworks.tsx use.
const URL_OWNED_KEYS = [
    "all",
    "sort",
    "q",
    "unseen",
    "type",
    "faction",
    "loyal",
    "unique",
    "icons",
    "cost",
    "strength",
    "income",
    "initiative",
    "claim",
    "reserve",
    "name",
    "text",
    "flavor",
    "designer",
    "traits",
    "mine",
    "byUsers",
    "draftFilter",
    "approvedFilter",
    "myReactions",
    "rewardTypes",
    "punishment",
    "abilityTypes",
    "iconic"
];

export default function Suggestions() {
    return (
        <ScopedSearchParamsProvider>
            <SuggestionsContent />
        </ScopedSearchParamsProvider>
    );
}

function SuggestionsContent() {
    usePageTitle("Suggestions");
    const canCreate = usePermission(Permission.MAKE_SUGGESTIONS);
    const { data: feed, isLoading } = useGetSuggestionsFeedQuery();
    const [editing, setEditing] = useState<DeepPartial<ICardSuggestion>>();

    // A draft's own detail page has nowhere to render itself - it redirects here with the already-
    // loaded suggestion via router state, consumed once and cleared so a refresh can't reopen it.
    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => {
        const editDraft = (location.state as { editDraft?: DeepPartial<ICardSuggestion> } | null)?.editDraft;
        if (editDraft) {
            setEditing(editDraft);
            navigate(location.pathname + location.search, { replace: true, state: null });
        }
    }, [location.state, location.pathname, location.search, navigate]);

    // All "browse everything" state is shareable via the url, seeded once on mount - a later in-page
    // jump updates this state directly rather than relying on a url change, since nothing unmounts
    // once opened. Sticky rather than tracking isBrowsingAll directly - SuggestionsGrid stays mounted
    // (and keeps its own fetch/filter state) once opened, but isn't built at all before that.
    const [searchParams] = useSearchParams();
    const [isBrowsingAll, setIsBrowsingAll] = useState(() => searchParams.get("all") === "true");
    const [hasOpenedAll, setHasOpenedAll] = useState(isBrowsingAll);
    const [filter, setFilter] = useState<SuggestionFilterValue>(() => suggestionFilterFromParams(searchParams));
    const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
    const [sortBy, setSortBy] = useState<SortOption>(
        () => (searchParams.get("sort") as SortOption | null) ?? "updated"
    );
    // Bumped whenever a preset is applied from outside the grid - SuggestionsGrid keys its animated
    // list on this so arriving with a filter already applied snaps straight in, no reorder animation.
    const [browseSessionKey, setBrowseSessionKey] = useState(0);

    const scopeParams = useMemo((): ScopeParams => {
        const params: ScopeParams = Object.fromEntries(URL_OWNED_KEYS.map((key) => [key, undefined]));
        if (!isBrowsingAll) {
            return params;
        }
        params.all = "true";
        if (sortBy !== "updated") {
            params.sort = sortBy;
        }
        if (search.trim()) {
            params.q = search.trim();
        }
        Object.assign(params, suggestionFilterToParams(filter));
        return params;
    }, [isBrowsingAll, sortBy, search, filter]);
    useSearchParamsScope("all-suggestions", true, scopeParams);

    // Opens the browse page with a fresh preset - a stat/coverage/focus-area entry point never
    // wants to inherit whatever was left over from a previous visit to the browse page.
    const openAll = (preset?: { filter?: SuggestionFilterValue; sort?: SortOption }) => {
        setFilter(preset?.filter ?? EMPTY_SUGGESTION_FILTER);
        setSearch("");
        setSortBy(preset?.sort ?? "updated");
        setIsBrowsingAll(true);
        setHasOpenedAll(true);
        setBrowseSessionKey((key) => key + 1);
    };

    let sectionIndex = 0;

    return (
        <SlidingPages currentPage={isBrowsingAll ? 2 : 1}>
            <div className="flex flex-col gap-5">
                <div className="px-4 md:px-0 space-y-2 md:space-y-4">
                    <div className="flex flex-row items-end justify-between gap-6">
                        <div className="flex-1 min-w-0 font-semibold font-cinzel tracking-widest text-3xl sm:text-4xl">
                            Suggestions
                        </div>
                        <HeaderActions
                            items={[
                                canCreate && {
                                    key: "create",
                                    title: "Create Suggestion",
                                    icon: <FontAwesomeIcon icon={faPlus} size="xl" />,
                                    color: "primary",
                                    onPress: () => setEditing({})
                                }
                            ]}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1">
                        <div className="text-sm lg:text-medium text-foreground/70 italic">
                            Card designs proposed by the design team.
                        </div>
                        <button
                            type="button"
                            onClick={() => openAll()}
                            className="text-xs sm:text-sm text-primary shrink-0 whitespace-nowrap cursor-pointer hover:brightness-125"
                        >
                            All Suggestions <FontAwesomeIcon icon={faArrowRight} />
                        </button>
                    </div>
                </div>

                <Reveal index={sectionIndex++}>
                    <StatsGrid className="border border-content3 drop-shadow-lg">
                        <StatCard
                            label="Active Suggestions"
                            value={feed?.stats.total}
                            footer={feed && `across ${feed.stats.totalSubmitters} users`}
                            isLoading={isLoading}
                            onPress={() => openAll()}
                        />
                        <StatCard
                            label="Awaiting Approval"
                            value={feed?.stats.awaitingApproval}
                            footer="across all liked suggestions"
                            isLoading={isLoading}
                            onPress={() => openAll({ filter: { approvedFilter: "awaiting" }, sort: "updated" })}
                        />
                        <StatCard
                            label="New Suggestions"
                            value={feed?.stats.unreacted}
                            footer="you haven't reacted to yet"
                            isLoading={isLoading}
                            onPress={() => openAll({ filter: { unseen: true }, sort: "updated" })}
                        />
                        <StatCard
                            label="My Suggestions"
                            value={feed?.stats.mine}
                            footer={feed && `with ${feed.stats.myDrafts} as drafts`}
                            isLoading={isLoading}
                            onPress={() => openAll({ filter: { mine: true }, sort: "draft" })}
                        />
                    </StatsGrid>
                </Reveal>

                {(isLoading || !!feed?.recent.length) && (
                    <Reveal index={sectionIndex++}>
                        <div className="flex flex-col gap-2">
                            <div className="px-4 md:px-0 flex items-center justify-between gap-2">
                                <SectionTitle size="sm" indent="xs" className="flex-1 min-w-0">
                                    Recent Suggestions
                                </SectionTitle>
                                {!isLoading && (
                                    <button
                                        type="button"
                                        onClick={() => openAll({ sort: "updated" })}
                                        className="text-xs text-primary shrink-0 whitespace-nowrap cursor-pointer hover:brightness-125"
                                    >
                                        See all <FontAwesomeIcon icon={faArrowRight} />
                                    </button>
                                )}
                            </div>
                            {/* Caps the rail at 2 rows, no JS - grid-auto-rows collapses any further
                                row to 0 height, and overflow-hidden clips whatever spills into it. */}
                            {isLoading ? (
                                <div className="grid gap-1 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 grid-rows-[repeat(2,auto)] auto-rows-[0px] overflow-hidden">
                                    {Array.from({ length: 10 }).map((_, index) => (
                                        <LoadingCard key={index} />
                                    ))}
                                </div>
                            ) : (
                                <CardGrid
                                    size="md"
                                    cards={feed?.recent ?? []}
                                    className="grid-rows-[repeat(2,auto)] auto-rows-[0px] overflow-hidden"
                                >
                                    {(suggestion) => <SuggestionCardLink key={suggestion.id} suggestion={suggestion} />}
                                </CardGrid>
                            )}
                        </div>
                    </Reveal>
                )}

                <Reveal index={sectionIndex++} className="flex flex-col md:flex-row gap-2 md:gap-4">
                    <div className="md:flex-1 min-w-0 space-y-2">
                        <SuggestionSpread
                            onSelect={(preset) => openAll({ filter: { ...EMPTY_SUGGESTION_FILTER, ...preset } })}
                        />
                    </div>
                    <SuggestionApprovalPanel className="md:flex-1 min-w-0 flex flex-col gap-2" />
                </Reveal>

                <EditSuggestionModal
                    isOpen={!!editing}
                    suggestion={editing}
                    onClose={() => setEditing(undefined)}
                    onSave={(suggestion) =>
                        addToast({
                            title: "Successfully saved",
                            color: "success",
                            description: `"${suggestion.card.name}" suggestion has been saved`
                        })
                    }
                />
            </div>
            {hasOpenedAll ? (
                <SuggestionsGrid
                    animationKey={browseSessionKey}
                    filter={filter}
                    onFilterChange={setFilter}
                    search={search}
                    onSearchChange={setSearch}
                    sortBy={sortBy}
                    onSortChange={setSortBy}
                    onBack={() => setIsBrowsingAll(false)}
                />
            ) : (
                <div />
            )}
        </SlidingPages>
    );
}

function StatCard({ label, value, footer, isLoading = false, onPress }: StatCardProps) {
    if (isLoading) {
        return (
            <div className="bg-content2 px-5 py-5 space-y-2">
                <Skeleton className="h-4 w-32 rounded-sm" />
                <Skeleton className="h-12 w-16 rounded-sm" />
                <Skeleton className="h-4 w-28 rounded-sm" />
            </div>
        );
    }
    const content = (
        <>
            <div className="text-xs font-cinzel tracking-wide uppercase text-foreground/50">{label}</div>
            <div className="text-5xl font-sans text-foreground mt-2 leading-none">{value ?? "-"}</div>
            {footer && <div className="text-sm font-serif italic text-foreground/50 mt-2">{footer}</div>}
        </>
    );
    if (!onPress) {
        return <div className="bg-content2 px-5 py-5">{content}</div>;
    }
    return (
        <button
            type="button"
            onClick={onPress}
            className="bg-content2 px-5 py-5 text-left cursor-pointer hover:bg-content3 transition-colors"
        >
            {content}
        </button>
    );
}
type StatCardProps = {
    label: string;
    value?: ReactNode;
    footer?: ReactNode;
    isLoading?: boolean;
    onPress?: () => void;
};
