import { addToast, Button, Divider, Skeleton, Tab, Tabs } from "@heroui/react";
import { BaseElementProps } from "../../types";
import { versionLabel } from "./versionLabel";
import { scrollableTabs, useSelectedTabInView } from "../../hooks/useSelectedTabInView";
import { PageActiveContext } from "../../hooks/useIsPageActive";
import Reveal from "../../components/reveal";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    useGetCardQuery,
    useGetCardsQuery,
    useGetPlaytestingUpdatesQuery,
    useGetProjectQuery,
    useGetSlotQuery
} from "../../api";
import { cardVersionRank, IPlaytestCard } from "common/models/cards";
import { ISlotOptions } from "common/models/slots";
import { InquiryLinkAction, inquiryLinkActions } from "common/models/refinement";
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
    faSliders,
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
import { changeTypeClasses, cornerBadgeDiscFillClasses } from "../../constants";
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
import SlotOptionsModal from "../../components/slots/slotOptionsModal";
import { useSlotTitle } from "../../components/slots/slotTitle";
import usePageTitle from "../../hooks/usePageTitle";
import useSwipe from "../../hooks/useSwipe";
import useConsumableParams from "../../hooks/useConsumableParams";
import CardHeader from "./cardHeader";
import ArtworkTab from "./artwork/artworkTab";
import RefinementTab from "./refinement/refinementTab";
import { useSearchParamsScope } from "../../hooks/useSearchParamsScope";
import ScopedSearchParamsProvider from "../../components/scopedSearchParamsProvider";
import Error from "../../components/error";

const CARD_PARAMS = ["releaseCheck", "inquiry", "action"] as const;

export type CardTab = "development" | "artwork" | "refinement";

function entryCardTab(tab?: string): CardTab {
    return tab === "artwork" || tab === "refinement" ? tab : "development";
}

export default function CardDetail({ className, style, project: projectNumber, number }: CardDetailProps) {
    const { data: project, isLoading: isLoadingProject } = useGetProjectQuery({ number: projectNumber });
    const { data: card, isLoading: isLoadingCard } = useGetCardQuery({
        project: projectNumber,
        number,
        version: "visible"
    });
    // The header holds the slot's chips, so the page waits for them rather than have them pop in
    const canReadSlots = usePermission(Permission.READ_SLOTS);
    const { isLoading: isLoadingSlot } = useGetSlotQuery({ project: projectNumber, number }, { skip: !canReadSlots });
    usePageTitle(`#${parseCardCode(false, projectNumber, number)}`);
    // Consumed once here for the whole page - two callers would each strip their own keys and race
    const {
        releaseCheck: entryReleaseCheck,
        inquiry: entryInquiry,
        action: entryAction
    } = useConsumableParams(CARD_PARAMS);
    const entryInquiryNumber = entryInquiry !== undefined ? Number(entryInquiry) : undefined;
    const entryInquiryAction = inquiryLinkActions.find((action) => action === entryAction);

    if (isLoadingProject || isLoadingCard || isLoadingSlot) {
        return <CardDetailSkeleton />;
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
            <ScopedSearchParamsProvider>
                <CardContent
                    project={projectNumber}
                    number={number}
                    entryReleaseCheck={entryReleaseCheck}
                    entryInquiry={entryInquiryNumber}
                    entryInquiryAction={entryInquiryAction}
                />
            </ScopedSearchParamsProvider>
        </div>
    );
}

// Split out so its tab state can sit inside the ScopedSearchParamsProvider CardDetail renders around it
function CardContent({ project, number, entryReleaseCheck, entryInquiry, entryInquiryAction }: CardContentProps) {
    const [searchParams] = useSearchParams();
    const [tab, setTab] = useState<CardTab>(() => entryCardTab(searchParams.get("tab") ?? undefined));
    // Lets a link to the artwork/refinement tab be copy-pasted; development (the default) leaves no trace
    const tabParams = useMemo(() => ({ tab: tab === "development" ? undefined : tab }), [tab]);
    useSearchParamsScope("tab", true, tabParams);
    const sectionTabsRef = useSelectedTabInView(tab);

    const canReadArtwork = usePermission(Permission.READ_ARTWORKS);
    const canReadRefinement = usePermission(Permission.READ_REFINEMENT);
    // A tab is only built once opened, then kept - so arriving on the card doesn't pay for every tab at once
    const [openedTabs, setOpenedTabs] = useState(() => new Set([tab]));
    if (!openedTabs.has(tab)) {
        setOpenedTabs(new Set(openedTabs).add(tab));
    }
    const panel = (key: CardTab, content: ReactNode) =>
        openedTabs.has(key) && (
            <PageActiveContext.Provider value={tab === key}>
                <Reveal direction={null}>{content}</Reveal>
            </PageActiveContext.Provider>
        );

    let sectionIndex = 0;

    return (
        <>
            <Reveal index={sectionIndex++} className="px-4 md:px-0 flex-1 flex flex-col sm:flex-row">
                <CardHeader project={project} number={number} className="flex-1" />
                <ButtonSection
                    project={project}
                    number={number}
                    entryReleaseCheck={entryReleaseCheck}
                    className="self-end sm:self-start"
                />
            </Reveal>
            <PermissionGate requires={Permission.READ_STATS_SLOT}>
                <Reveal index={sectionIndex++}>
                    <CardProgress project={project} number={number} onOpenArtwork={() => setTab("artwork")} />
                </Reveal>
            </PermissionGate>
            {canReadArtwork || canReadRefinement ? (
                <Reveal index={sectionIndex++}>
                    <div ref={sectionTabsRef}>
                        <Tabs
                            classNames={scrollableTabs}
                            selectedKey={tab}
                            onSelectionChange={(key) => setTab(key as CardTab)}
                            aria-label="Card Sections"
                            variant="underlined"
                            color="primary"
                            size="lg"
                            destroyInactiveTabPanel={false}
                        >
                            <Tab key="development" title="Development">
                                {panel("development", <DevelopmentSection project={project} number={number} />)}
                            </Tab>
                            {canReadArtwork ? (
                                <Tab key="artwork" title="Artwork">
                                    {panel("artwork", <ArtworkTab project={project} number={number} />)}
                                </Tab>
                            ) : null}
                            {canReadRefinement ? (
                                <Tab key="refinement" title="Refinement">
                                    {panel(
                                        "refinement",
                                        <RefinementTab
                                            project={project}
                                            number={number}
                                            highlightInquiry={entryInquiry}
                                            arrivalAction={entryInquiryAction}
                                        />
                                    )}
                                </Tab>
                            ) : null}
                        </Tabs>
                    </div>
                </Reveal>
            ) : (
                <Reveal index={sectionIndex++}>
                    <DevelopmentSection project={project} number={number} />
                </Reveal>
            )}
        </>
    );
}
// The page's own shape while it loads - header and actions, the progress strip, the tabs, then the version stack
// beside its decks - so it reads as the page arriving rather than as one block standing in for all of it
function CardDetailSkeleton() {
    return (
        <div className="space-y-2">
            <div className="px-4 md:px-0 flex flex-col sm:flex-row gap-3">
                <div className="flex-1 flex flex-col gap-2">
                    <Skeleton className="h-5 w-40 rounded-md" />
                    <Skeleton className="h-9 w-64 max-w-full rounded-md" />
                    <Skeleton className="h-6 w-48 rounded-md" />
                </div>
                <div className="flex gap-2 self-end sm:self-start">
                    <Skeleton className="h-10 w-28 rounded-medium" />
                    <Skeleton className="h-10 w-10 rounded-medium" />
                </div>
            </div>
            <Skeleton className="h-12 w-full rounded-md" />
            <div className="flex gap-4 px-2">
                <Skeleton className="h-8 w-28 rounded-md" />
                <Skeleton className="h-8 w-20 rounded-md" />
            </div>
            <div className="flex flex-col md:flex-row gap-2">
                <div className="flex flex-col items-center gap-2 md:w-80">
                    <Skeleton className="h-8 w-full rounded-lg" />
                    <Skeleton className="w-64 aspect-[240/333] rounded-xl" />
                </div>
                <Skeleton className="flex-1 min-h-64 rounded-md" />
            </div>
        </div>
    );
}

type CardContentProps = {
    project: number;
    number: number;
    entryReleaseCheck?: string;
    /** An inquiry named by the link the page was opened from, and what the link asked to do with it */
    entryInquiry?: number;
    entryInquiryAction?: InquiryLinkAction;
};

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
        <div className={classNames("flex flex-col min-w-0", isPlot ? "md:w-98" : "md:w-72", className)} style={style}>
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
    const canReadSlots = usePermission(Permission.READ_SLOTS);
    const { data: slot } = useGetSlotQuery({ project, number }, { skip: !canReadSlots });
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
                const rankA = cardVersionRank(a);
                const rankB = cardVersionRank(b);

                if (rankA !== rankB) {
                    return rankB - rankA;
                }

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
                        title={
                            <span className="text-base font-sans">
                                {versionLabel(card, topIsReleaseBound && index === 0)}
                            </span>
                        }
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

    const tabsRef = useSelectedTabInView(selectedIndex);

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
                <DraftActions project={project} number={number} slot={slot} className="shrink-0" />
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
export function StackedVersion({ card, isSelected }: StackedVersionProps) {
    // A fresh object each render would defeat CardPreview's memo, re-laying out every card in the stack
    const renderCard = useMemo(() => renderPlaytestingCard(card), [card]);

    return (
        <div className="relative size-full">
            {card.latest && card.released ? <CardImage card={card} /> : <CardPreview card={renderCard} />}
            {card.note && (
                <ChangeBadge
                    card={card}
                    className={classNames("absolute top-0 right-0 m-2 z-10", !isSelected && "pointer-events-none")}
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

    const badgeClassName = classNames(
        "flex items-center justify-center size-8 rounded-full ring-1 ring-primary/70",
        cornerBadgeDiscFillClasses
    );
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
    const canEditSlot = usePermission(Permission.EDIT_SLOTS);
    const { data: slot } = useGetSlotQuery(
        { project: projectNumber, number },
        { skip: !canReadFeedback && !canEditSlot }
    );
    const [isEditingSlot, setIsEditingSlot] = useState(false);
    const { data: project } = useGetProjectQuery({ number: projectNumber });
    // Allows deep-linking straight into the modal (eg. the capsule buttons, or Discord's /checks)
    const [feedbackOpen, setFeedbackOpen] = useState(entryReleaseCheck === "1");

    // Feeds the modal's read-only mode - checks close with the card's design, or with its release
    const release = project?.releases.find((entry) => entry.code === slot?.release?.code);

    const latest = useMemo(
        () => [...(cardsData?.items ?? [])].reverse().find((card) => card.latest),
        [cardsData?.items]
    );
    const isReleased = !!(latest && latest.released);
    const feedbackCount = slot?.statuses.design.checks.release.length ?? 0;

    // The same statuses the desktop icon row renders, as dropdown entries for mobile
    const canReadDiscord = usePermission(Permission.READ_DISCORD_CARD_FORUM);
    const { data: discordStatus } = useDiscordCardStatus(projectNumber, number);
    const { data: githubStatus } = useGithubCardStatus(projectNumber, number);
    const { data: imageStatus } = useCardImageStatus(projectNumber, number);
    const isSyncable = !!project && !project.draft;
    const statusItems = isSyncable
        ? [
              canReadDiscord && statusActionItem("discord-status", discordStatus, { isDropdownOnly: true }),
              statusActionItem("github-status", githubStatus, { isDropdownOnly: true }),
              statusActionItem("image-status", imageStatus, { isDropdownOnly: true })
          ]
        : [];

    return (
        <div className={classNames("flex items-center gap-1.5", className)} style={style}>
            {isSyncable && (
                <div className="hidden sm:flex items-center gap-1.5">
                    <PermissionGate requires={Permission.READ_DISCORD_CARD_FORUM}>
                        <DiscordCardStatus project={projectNumber} number={number} isIconOnly />
                    </PermissionGate>
                    <GithubCardStatus project={projectNumber} number={number} isIconOnly />
                    <ImageStatus project={projectNumber} number={number} isIconOnly />
                </div>
            )}
            <HeaderActions
                items={[
                    ...statusItems,
                    canEditSlot &&
                        !!slot && {
                            key: "slot-options",
                            title: "Edit Slot Options",
                            icon: <FontAwesomeIcon icon={faSliders} size="xl" />,
                            onPress: () => setIsEditingSlot(true)
                        },
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
            {isEditingSlot && slot && <SlotOptionsModal isOpen slot={slot} onClose={() => setIsEditingSlot(false)} />}
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
    slot,
    showDivider = true
}: DraftActionsProps) {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project: projectNumber, number } });
    const [editing, setEditing] = useState<IPlaytestCard>();
    const [deleting, setDeleting] = useState<IPlaytestCard>();

    const canCreateDraft = usePermission(Permission.CREATE_CARDS);
    const canEditDraft = usePermission(Permission.EDIT_CARDS);
    const canDeleteDraft = usePermission(Permission.DELETE_CARDS);
    // Titled as drafting titles them, and held while a modal closes so its title doesn't change as it fades
    const editorAction = useRef("New Draft");
    const deleteAction = useRef("");
    if (editing) {
        editorAction.current = editing.draft ? "Edit Draft" : "New Draft";
    }
    if (deleting) {
        deleteAction.current = `${deleting.suggestionId ? "Remove" : "Delete"} "${deleting.name}"?`;
    }
    const editorTitle = useSlotTitle(projectNumber, number, editorAction.current);
    const deleteTitle = useSlotTitle(projectNumber, number, deleteAction.current);

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
                title={editorTitle}
                isOpen={!!editing}
                card={editing}
                conditions={slot?.conditions}
                isImportant={slot?.important}
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
                title={deleteTitle}
                isOpen={!!deleting}
                card={deleting}
                onClose={() => setDeleting(undefined)}
                onDelete={(card) =>
                    addToast({
                        title: card.suggestionId ? "Successfully removed" : "Successfully deleted",
                        color: "success",
                        description: `'${card.name}' ver. ${card.version} has been ${card.suggestionId ? "removed" : "deleted"}`
                    })
                }
            />
        </div>
    );
}
type DraftActionsProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    /** The card's slot, from the caller - a list of cards already holds every slot */
    slot?: ISlotOptions;
    showDivider?: boolean;
};
