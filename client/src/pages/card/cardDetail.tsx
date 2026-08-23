import { addToast, Button, Divider, Skeleton, Tab, Tabs } from "@heroui/react";
import { BaseElementProps } from "../../types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    useGetCardQuery,
    useGetCardsQuery,
    useGetPlaytestingUpdatesQuery,
    useGetProjectQuery,
    useGetSlotQuery
} from "../../api";
import { IPlaytestCard } from "common/models/cards";
import { cloneDeep } from "lodash-es";
import { CardPreview } from "@agot/card-preview";
import { getMostRecent, parseCardCode, renderPlaytestingCard, SemanticVersion } from "common/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faChevronLeft,
    faChevronRight,
    faPencil,
    faPlus,
    faScroll,
    faThumbsUp,
    faTrash
} from "@fortawesome/free-solid-svg-icons";
import { rcompare } from "semver";
import classNames from "classnames";
import CardImage from "../../components/cardImage";
import EditCardModal from "./editCardModal";
import DeleteCardModal from "./deleteCardModal";
import LoadingCard from "../../components/loadingCard";
import PermissionGate from "../../components/permissionGate";
import Permission from "common/models/permissions";
import { usePermission } from "../../hooks/usePermission";
import { useIsReleaseBound } from "../../hooks/useIsReleaseBound";
import { Link, useSearchParams } from "react-router-dom";
import ImageStatus from "../../components/status/imageStatus";
import GithubCardStatus from "../../components/status/githubCardStatus";
import DiscordCardStatus from "../../components/status/discordCardStatus";
import CardStack from "../../components/cardStack";
import { TouchTooltip } from "../../components/touchTooltip";
import { noteTypeIcon, parseParamSemanticVersion } from "../../utils";
import RichText from "../../components/richText";
import { changeTypeClasses } from "../../constants";
import HeaderActions from "../../components/actions/headerActions";
import { ActionItem } from "../../components/actions/types";
import { statusActionItem } from "../../components/actions/statusActionItem";
import { useDiscordCardStatus } from "../../components/status/useDiscordCardStatus";
import { useGithubCardStatus } from "../../components/status/useGithubCardStatus";
import { useCardImageStatus } from "../../components/status/useCardImageStatus";
import DeckSummaries from "./deckSummaries";
import FeedbackStatistics from "./feedbackStatistics";
import CardProgress from "./cardProgress";
import ReleaseChecksModal from "../../components/releaseChecksModal";
import usePageTitle from "../../hooks/usePageTitle";
import useSwipe from "../../hooks/useSwipe";
import useConsumableParams from "../../hooks/useConsumableParams";
import CardHeader from "./cardHeader";
import ArtworkTab from "./artwork/artworkTab";
import useHistoryState from "../../hooks/useHistoryState";
import Error from "../../components/error";

const CARD_PARAMS = ["releaseCheck", "tab"] as const;

export type CardTab = "development" | "artwork";

export default function CardDetail({ className, style, project: projectNumber, number }: CardDetailProps) {
    const { data: project, isLoading: isLoadingProject } = useGetProjectQuery({ number: projectNumber });
    const { data: card, isLoading: isLoadingCard } = useGetCardQuery({
        project: projectNumber,
        number,
        version: "visible"
    });
    usePageTitle(`#${parseCardCode(false, projectNumber, number)}`);
    // Consumed once here for the whole page - two callers would each strip their own keys and race
    const { releaseCheck: entryReleaseCheck, tab: entryTab } = useConsumableParams(CARD_PARAMS);
    const [tab, setTab] = useHistoryState<CardTab>("tab", entryTab === "artwork" ? "artwork" : "development");
    const canReadArtwork = usePermission(Permission.READ_ARTWORKS);

    if (isLoadingProject || isLoadingCard) {
        return (
            <div>
                <Skeleton className="w-full h-98 rounded-md" />
            </div>
        );
    }

    if (!project || !card) {
        return (
            <Error
                label="No such card exists in the Citadel's archives..."
                content="This card could not be found. It may have been removed, archived, or you may have followed an incorrect link."
            />
        );
    }

    return (
        <div className={classNames("space-y-2", className)} style={style}>
            <div className="px-4 md:px-0 flex-1 flex flex-col sm:flex-row">
                <CardHeader project={projectNumber} number={number} className="flex-1" />
                <ButtonSection
                    project={projectNumber}
                    number={number}
                    entryReleaseCheck={entryReleaseCheck}
                    className="self-end sm:self-start"
                />
            </div>
            <PermissionGate requires={Permission.READ_STATS_SLOT}>
                <CardProgress project={projectNumber} number={number} />
            </PermissionGate>
            {canReadArtwork ? (
                <Tabs
                    selectedKey={tab}
                    onSelectionChange={(key) => setTab(key as CardTab)}
                    aria-label="Card Sections"
                    variant="underlined"
                    color="primary"
                    size="lg"
                    destroyInactiveTabPanel={false}
                >
                    <Tab key="development" title="Development">
                        <DevelopmentSection project={projectNumber} number={number} />
                    </Tab>
                    <Tab key="artwork" title="Artwork">
                        <ArtworkTab project={projectNumber} number={number} />
                    </Tab>
                </Tabs>
            ) : (
                <DevelopmentSection project={projectNumber} number={number} />
            )}
        </div>
    );
}

function DevelopmentSection({ project, number }: { project: number; number: number }) {
    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-2 w-full overflow-hidden">
                <CardVersions project={project} number={number} className="z-10" />
                <div className="flex flex-col gap-2 flex-1">
                    <PermissionGate requires={Permission.READ_DECKS}>
                        <DeckSummaries project={project} number={number} className="flex-1" />
                    </PermissionGate>
                </div>
            </div>
            <PermissionGate requires={Permission.READ_REVIEWS}>
                <FeedbackStatistics project={project} number={number} />
            </PermissionGate>
        </div>
    );
}

type CardDetailProps = Omit<BaseElementProps, "children"> & { project: number; number: number };

function versionLabel(card: IPlaytestCard, topIsReleaseBound: boolean): string {
    if (card.latest && card.released) {
        return "Release";
    }
    if ((card.latest || card.draft) && topIsReleaseBound) {
        return "Release";
    }
    if (card.latest) {
        return "Latest";
    }
    if (card.draft) {
        return "Draft";
    }
    return card.version;
}

// The full version stack needs READ_CARDS (it reads every historical version); a READ_LATEST_CARDS-only
// viewer instead gets just the one card they're entitled to see, with no stack/tabs to navigate between.
function CardVersions(props: CardVersionsProps) {
    const canReadCards = usePermission(Permission.READ_CARDS);
    return canReadCards ? <FullCardVersions {...props} /> : <LimitedCardVersion {...props} />;
}

function LimitedCardVersion({ className, style, project, number }: CardVersionsProps) {
    const { data: card, isLoading } = useGetCardQuery({ project, number, version: "visible" });
    const isPlot = card?.type === "plot";
    const topIsReleaseBound = useIsReleaseBound(project, number);

    if (isLoading) {
        return (
            <div className={classNames("flex flex-col", isPlot ? "md:w-98" : "md:w-72", className)} style={style}>
                <Skeleton className="h-8 rounded-lg" />
                <LoadingCard className="m-2" />
            </div>
        );
    }
    if (!card) {
        return null;
    }

    return (
        <div
            className={classNames("flex flex-col min-w-0", isPlot ? "md:w-98" : "md:w-72", className)}
            style={style}
        >
            <div className="text-center text-base font-sans px-4">{versionLabel(card, topIsReleaseBound)}</div>
            <div className="flex justify-center py-4">
                <div className={classNames("max-w-full", isPlot ? "w-98" : "w-64")}>
                    <StackedVersion card={card} isSelected />
                </div>
            </div>
        </div>
    );
}

function FullCardVersions({ className, style, project, number }: CardVersionsProps) {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project, number } });
    const [selectedIndex, setSelectedIndex] = useState<number | undefined>();
    const [searchParams] = useSearchParams();
    // Allows auto-selecting of specific version (eg. ?version=1.0.0)
    const version = searchParams.get("version") ?? undefined;
    const preselectedVersion = parseParamSemanticVersion(version);

    const topIsReleaseBound = useIsReleaseBound(project, number);

    const sortedCards = useMemo(() => {
        if (!cardsData) {
            return [];
        }
        return (
            [...cardsData.items].sort((a, b) => {
                const rank = (card: IPlaytestCard): number => {
                    if (card.latest && card.released) return 0;
                    if (card.draft) return 1;
                    if (card.latest) return 2;
                    return 3;
                };

                const rankA = rank(a);
                const rankB = rank(b);

                if (rankA !== rankB) return rankB - rankA;

                // Same rank — sort by semver descending
                return rcompare(b.version, a.version);
            }) ?? []
        );
    }, [cardsData]);

    // If a draft gets added, update selected. Otherwise, selected should default to most recent
    const hasDraft = useMemo(() => sortedCards.some((card) => card.draft), [sortedCards]);
    useEffect(() => {
        if (preselectedVersion) {
            const index = sortedCards.findIndex((card) => card.version === preselectedVersion);
            if (index >= 0) {
                setSelectedIndex(index);
                return;
            }
        }

        const targetVersion = hasDraft
            ? sortedCards.find((card) => card.draft)?.version
            : getMostRecent(cardsData?.items ?? [])?.version;

        if (targetVersion) {
            const index = sortedCards.findIndex((card) => card.version === targetVersion);
            if (index >= 0) setSelectedIndex(index);
        }
    }, [hasDraft, preselectedVersion, sortedCards, cardsData]);

    const isPlot = useMemo(() => !!cardsData?.items.some((card) => card.type === "plot"), [cardsData?.items]);
    const columnClass = isPlot ? "md:w-98" : "md:w-72";

    const tabs = useMemo(
        () =>
            sortedCards
                .map((card, index) => (
                    <Tab
                        key={index}
                        title={<span className="text-base font-sans">{versionLabel(card, topIsReleaseBound)}</span>}
                    />
                ))
                .reverse(),
        [sortedCards, topIsReleaseBound]
    );

    // Tabs render right-to-left over a reversed list, so stepping left moves up the list. The arrows
    // stop at the ends where a swipe carries on round, which is the only difference between them.
    const canStep = useCallback(
        (offset: -1 | 1) => {
            const next = (selectedIndex ?? 0) + offset;
            return selectedIndex !== undefined && next >= 0 && next < sortedCards.length;
        },
        [selectedIndex, sortedCards.length]
    );
    const selectRelative = useCallback(
        (offset: -1 | 1, wrap = false) =>
            setSelectedIndex((prev) => {
                if (prev === undefined) {
                    return prev;
                }
                const next = prev + offset;
                if (next >= 0 && next < sortedCards.length) {
                    return next;
                }
                return wrap ? (next + sortedCards.length) % sortedCards.length : prev;
            }),
        [sortedCards.length]
    );

    // HeroUI only scrolls a tab into view when that tab itself is clicked, so a selection moved by the
    // arrows (or a swipe) has to be brought into view by hand
    const tabsRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        tabsRef.current
            ?.querySelector('[role="tab"][aria-selected="true"]')
            ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }, [selectedIndex]);

    const swipeHandlers = useSwipe((direction) => selectRelative(direction === "right" ? -1 : 1, true), {
        directions: ["left", "right"]
    });

    if (isLoading) {
        return (
            <div className={classNames("flex flex-col", columnClass, className)} style={style}>
                <Skeleton className="h-8 rounded-lg" />
                <LoadingCard className="m-2" />
            </div>
        );
    }
    return (
        <div className={classNames("flex flex-col min-w-0", columnClass, className)} style={style}>
            <div className="flex items-center">
                <DraftActions project={project} number={number} className="shrink-0" />
                <div className="relative flex-1 min-w-0 px-4">
                    <div ref={tabsRef}>
                        <Tabs
                            className="flex-row-reverse justify-end select-none"
                            classNames={{ base: "w-full", tabList: "px-0", tab: "px-2" }}
                            selectedKey={String(selectedIndex)}
                            onSelectionChange={(index) => setSelectedIndex(Number(index))}
                            aria-label="Card Versions"
                            variant="underlined"
                            color="primary"
                            destroyInactiveTabPanel={false}
                        >
                            {tabs}
                        </Tabs>
                    </div>
                    <VersionArrow
                        direction="left"
                        isAvailable={canStep(1)}
                        onPress={() => selectRelative(1)}
                        className="absolute left-0 top-1/2 -translate-y-1/2"
                    />
                    <VersionArrow
                        direction="right"
                        isAvailable={canStep(-1)}
                        onPress={() => selectRelative(-1)}
                        className="absolute right-0 top-1/2 -translate-y-1/2"
                    />
                </div>
            </div>
            <div className="flex justify-center py-4" {...swipeHandlers}>
                <CardStack
                    cards={sortedCards}
                    selectedIndex={selectedIndex}
                    tilt={-1}
                    className={classNames("max-w-full", isPlot ? "w-98" : "w-64")}
                >
                    {(card, index) => <StackedVersion card={card} isSelected={index === selectedIndex} />}
                </CardStack>
            </div>
        </div>
    );
}

// One card of the stack. Its change badge is a sibling of the preview rather than a child, since the
// preview clips its own overflow - so it rides along with every tilt, slide and fade the stack applies.
function StackedVersion({ card, isSelected }: StackedVersionProps) {
    // A fresh object each render would defeat CardPreview's memo, re-laying out every card in the stack
    const renderCard = useMemo(() => renderPlaytestingCard(card), [card]);

    return (
        <div className="relative size-full">
            {card.latest && card.released ? <CardImage card={card} /> : <CardPreview card={renderCard} />}
            {card.note && (
                <ChangeBadge
                    card={card}
                    className={classNames(
                        "absolute top-0 right-0 m-2 z-10",
                        // Cards behind the front one still peek out, so only the front badge answers
                        !isSelected && "pointer-events-none"
                    )}
                />
            )}
        </div>
    );
}

type StackedVersionProps = {
    card: IPlaytestCard;
    isSelected: boolean;
};

// Steps the selection one version along. Bookends the tab list rather than overlaying it, holding its
// slim column whether or not there's a version that way, so the tabs never shift under the arrows.
function VersionArrow({ direction, isAvailable, onPress, className }: VersionArrowProps) {
    const isLeft = direction === "left";

    return (
        <Button
            isIconOnly
            size="sm"
            radius="sm"
            variant="light"
            aria-label={isLeft ? "Previous version" : "Next version"}
            className={classNames(
                "shrink-0 w-4 min-w-4 px-0 transition-opacity",
                !isAvailable && "opacity-0 pointer-events-none",
                className
            )}
            onPress={onPress}
        >
            <FontAwesomeIcon icon={isLeft ? faChevronLeft : faChevronRight} />
        </Button>
    );
}

type VersionArrowProps = {
    direction: "left" | "right";
    isAvailable: boolean;
    onPress: () => void;
    className?: string;
};

// Marks a version that arrived with a change note, and leads back to the Playtesting Update carrying it
function ChangeBadge({ className, style, card }: ChangeBadgeProps) {
    const canReadUpdates = usePermission(Permission.READ_PLAYTESTING_UPDATES);
    const { data: updatesData } = useGetPlaytestingUpdatesQuery(
        { filter: { project: card.project } },
        { skip: !canReadUpdates }
    );

    const update = useMemo(
        () => updatesData?.items.find((entry) => entry.cardChanges[card.number] === card.version),
        [updatesData?.items, card.number, card.version]
    );

    const note = card.note;
    if (!note) {
        return null;
    }

    const badgeClassName = "flex items-center justify-center size-8 rounded-full bg-black/60 ring-1 ring-primary/70";
    const badgeIcon = (
        <FontAwesomeIcon
            icon={noteTypeIcon[note.type]}
            className="text-lg text-primary drop-shadow-[0_0_4px_rgba(197,160,89,0.9)]"
        />
    );

    return (
        <TouchTooltip
            classNames={{ content: "p-0 overflow-hidden" }}
            content={
                <div className="max-w-64">
                    <div
                        className={classNames(
                            "px-4 py-2 text-sm tracking-wider font-cinzel uppercase",
                            changeTypeClasses[note.type]
                        )}
                    >
                        <FontAwesomeIcon icon={noteTypeIcon[note.type]} /> {note.type}
                    </div>
                    <div className="px-4 py-3 space-y-2">
                        <div className="text-xs font-sans normal-case leading-snug">
                            <RichText html={note.text} />
                        </div>
                        {update && (
                            <div className="text-[.65rem] font-sans normal-case text-foreground/60 leading-snug">
                                Click the badge to view the Playtesting Update this was part of.
                            </div>
                        )}
                    </div>
                </div>
            }
            placement="right-start"
        >
            {update ? (
                <Link
                    to={`/project/${card.project}/update/${update.version}?card=${card.number}`}
                    className={classNames(badgeClassName, "cursor-pointer", className)}
                    style={style}
                >
                    {badgeIcon}
                </Link>
            ) : (
                <div className={classNames(badgeClassName, "cursor-help", className)} style={style}>
                    {badgeIcon}
                </div>
            )}
        </TouchTooltip>
    );
}

type ChangeBadgeProps = Omit<BaseElementProps, "children"> & {
    card: IPlaytestCard;
};

type CardVersionsProps = Omit<BaseElementProps, "children"> & {
    selected?: SemanticVersion;
    project: number;
    number: number;
};

// Header row: the card-state icons plus Release Checks and Submit Review. On mobile the state icons
// fold into the actions dropdown, above its divider. Draft actions live over the card stack instead.
function ButtonSection({ className, style, project: projectNumber, number, entryReleaseCheck }: ButtonSectionProps) {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project: projectNumber, number } });
    const canSubmitReview = usePermission(Permission.MAKE_REVIEWS);
    const canReadFeedback = usePermission(Permission.READ_RELEASE_CHECKS);
    const { data: slot } = useGetSlotQuery({ project: projectNumber, number }, { skip: !canReadFeedback });
    const { data: project } = useGetProjectQuery({ number: projectNumber }, { skip: !canReadFeedback });
    // Allows deep-linking straight into the modal (eg. the capsule buttons, or Discord's /checks)
    const [feedbackOpen, setFeedbackOpen] = useState(entryReleaseCheck === "1");

    // Feeds the modal's read-only mode - checks close with the card's design, or with its release
    const release = project?.releases.find((entry) => entry.code === slot?.release?.code);

    const latest = useMemo(
        () => [...(cardsData?.items ?? [])].reverse().find((card) => card.latest),
        [cardsData?.items]
    );
    const isReleased = !!(latest && latest.released);
    const feedbackCount = slot?.statuses.design.checks.length ?? 0;

    // The same statuses the desktop icon row renders, as dropdown entries for mobile
    const canReadDiscord = usePermission(Permission.READ_DISCORD_CARD_FORUM);
    const { data: discordStatus } = useDiscordCardStatus(projectNumber, number);
    const { data: githubStatus } = useGithubCardStatus(projectNumber, number);
    const { data: imageStatus } = useCardImageStatus(projectNumber, number);
    const statusItems = [
        canReadDiscord && statusActionItem("discord-status", discordStatus, { isDropdownOnly: true }),
        statusActionItem("github-status", githubStatus, { isDropdownOnly: true }),
        statusActionItem("image-status", imageStatus, { isDropdownOnly: true })
    ];

    return (
        <div className={classNames("flex items-center gap-1.5", className)} style={style}>
            <div className="hidden sm:flex items-center gap-1.5">
                <PermissionGate requires={Permission.READ_DISCORD_CARD_FORUM}>
                    <DiscordCardStatus project={projectNumber} number={number} isIconOnly />
                </PermissionGate>
                <GithubCardStatus project={projectNumber} number={number} isIconOnly />
                <ImageStatus project={projectNumber} number={number} isIconOnly />
            </div>
            <HeaderActions
                items={[
                    ...statusItems,
                    canReadFeedback && {
                        key: "release-checks",
                        title: "Release Checks",
                        icon: <FontAwesomeIcon icon={faThumbsUp} size="xl" />,
                        badge: feedbackCount,
                        onPress: () => setFeedbackOpen(true)
                    },
                    !isLoading &&
                        !isReleased &&
                        canSubmitReview && {
                            key: "submit-review",
                            title: "Submit Review",
                            icon: <FontAwesomeIcon icon={faScroll} size="xl" />,
                            color: "primary",
                            to: `/review/submit?project=${projectNumber}&number=${number}`
                        }
                ]}
            />
            <ReleaseChecksModal
                isOpen={feedbackOpen}
                onClose={() => setFeedbackOpen(false)}
                project={projectNumber}
                number={number}
                releaseStatus={release?.status}
            />
        </div>
    );
}
type ButtonSectionProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    /** "1" when arriving from a release-check deep link, which opens the modal on mount */
    entryReleaseCheck?: string;
};

// New/Edit/Delete Draft. Self-contained (own query, permissions and modals), so any page can drop
// it in against just a project/number - sat to the left of the version tabs behind their own divider here.
export function DraftActions({
    className,
    style,
    project: projectNumber,
    number,
    showDivider = true
}: DraftActionsProps) {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project: projectNumber, number } });
    const [editing, setEditing] = useState<IPlaytestCard>();
    const [deleting, setDeleting] = useState<IPlaytestCard>();

    const canCreateDraft = usePermission(Permission.CREATE_CARDS);
    const canEditDraft = usePermission(Permission.EDIT_CARDS);
    const canDeleteDraft = usePermission(Permission.DELETE_CARDS);

    const onNewDraft = useCallback((latest: IPlaytestCard) => {
        const draft = cloneDeep(latest);
        delete draft.note;
        draft.latest = false;
        draft.implemented = false;
        delete draft._metadata;
        setEditing(draft);
    }, []);

    const { latest, draft } = useMemo(() => {
        let latest = undefined;
        let draft = undefined;

        for (const card of [...(cardsData?.items ?? [])].reverse()) {
            if (!latest && card.latest) {
                latest = card;
            }
            if (!draft && card.draft) {
                draft = card;
            }
        }
        return { latest, draft };
    }, [cardsData?.items]);

    if (isLoading) {
        return null;
    }

    const isReleased = !!(latest && latest.released);
    const items: (Pick<ActionItem, "key" | "title" | "icon" | "color"> & { onPress: () => void })[] = [];
    if (!isReleased && canCreateDraft && !draft && latest) {
        items.push({
            key: "new-draft",
            title: "New Draft",
            icon: <FontAwesomeIcon icon={faPlus} size="lg" />,
            color: "primary",
            onPress: () => onNewDraft(latest)
        });
    }
    if (!isReleased && canEditDraft && draft) {
        items.push({
            key: "edit-draft",
            title: "Edit Draft",
            icon: <FontAwesomeIcon icon={faPencil} size="lg" />,
            onPress: () => setEditing(draft)
        });
    }
    if (!isReleased && canDeleteDraft && draft) {
        items.push({
            key: "delete-draft",
            title: "Delete Draft",
            icon: <FontAwesomeIcon icon={faTrash} size="lg" />,
            color: "danger",
            onPress: () => setDeleting(draft)
        });
    }

    if (items.length === 0) {
        return null;
    }

    return (
        <div className={classNames("flex items-center gap-0.5", className)} style={style}>
            {items.map((item) => (
                <TouchTooltip key={item.key} content={item.title}>
                    <Button isIconOnly size="sm" variant="light" color={item.color} onPress={item.onPress}>
                        {item.icon}
                    </Button>
                </TouchTooltip>
            ))}
            {showDivider && <Divider orientation="vertical" className="h-5 mx-1" />}
            <EditCardModal
                isOpen={!!editing}
                card={editing}
                onClose={() => setEditing(undefined)}
                onSave={(card) =>
                    addToast({
                        title: "Successfully saved",
                        color: "success",
                        description: `'${card.name}' ver. ${card.version} has been ${draft ? "edited" : "created"}`
                    })
                }
            />
            <DeleteCardModal
                isOpen={!!deleting}
                card={deleting}
                onClose={() => setDeleting(undefined)}
                onDelete={(card) =>
                    addToast({
                        title: "Successfully deleted",
                        color: "success",
                        description: `'${card.name}' ver. ${card.version} has been deleted`
                    })
                }
            />
        </div>
    );
}
type DraftActionsProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    showDivider?: boolean;
};
