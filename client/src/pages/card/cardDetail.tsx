import { addToast, Button, Chip, Skeleton, Tab, Tabs } from "@heroui/react";
import { BaseElementProps } from "../../types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGetCardQuery, useGetCardsQuery, useGetProjectQuery, useGetSlotQuery } from "../../api";
import { IPlaytestCard } from "common/models/cards";
import { cloneDeep } from "lodash-es";
import { CardPreview } from "@agot/card-preview";
import { getFinalCardNumber, getMostRecent, parseCardCode, renderPlaytestingCard, SemanticVersion } from "common/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faAngleLeft,
    faFeather,
    faLayerGroup,
    faPencil,
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
import { useNavigate, useSearchParams } from "react-router-dom";
import ImageStatus from "../../components/status/imageStatus";
import GithubCardStatus from "../../components/status/githubCardStatus";
import DiscordCardStatus from "../../components/status/discordCardStatus";
import CardStack from "../../components/cardStack";
import { TouchTooltip } from "../../components/touchTooltip";
import { convertToNode, noteTypeIcon, parseParamSemanticVersion } from "../../utils";
import { changeTypeClasses, highlightTarget, releaseStatusColors } from "../../constants";
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
import PermissionedLink from "../../components/permissionedLink";
import Error from "../../components/error";

export default function CardDetail({ className, style, project: projectNumber, number }: CardDetailProps) {
    const { data: project, isLoading: isLoadingProject } = useGetProjectQuery({ number: projectNumber });
    const { data: card, isLoading: isLoadingCard } = useGetCardQuery({
        project: projectNumber,
        number,
        version: "latest"
    });
    usePageTitle(`#${parseCardCode(false, projectNumber, number)}`);

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
                <div className="flex-1 flex flex-col">
                    <div className="flex items-center gap-2">
                        <PermissionedLink
                            to={`/project/${projectNumber}`}
                            className="text-lg sm:text-2xl tracking-widest text-secondary font-cinzel leading-tight hover:brightness-150 w-fit"
                            requires={Permission.READ_PROJECTS}
                        >
                            <FontAwesomeIcon icon={faAngleLeft} /> {project?.name}
                        </PermissionedLink>
                        <ReleaseChip project={projectNumber} number={number} />
                    </div>
                    <div className="text-2xl sm:text-4xl tracking-wider font-cinzel font-semibold text-primary">
                        Playtesting Card #{parseCardCode(false, projectNumber, number)}
                    </div>
                </div>
                <ButtonSection project={projectNumber} number={number} className="self-end sm:self-start" />
            </div>
            <div className="space-y-4">
                <PermissionGate requires={Permission.READ_STATS_SLOT}>
                    <CardProgress project={projectNumber} number={number} />
                </PermissionGate>
                <div className="flex flex-col md:flex-row gap-2 w-full overflow-x-hidden">
                    <CardVersions project={projectNumber} number={number} className="z-10" />
                    <div className="flex flex-col gap-2 flex-1">
                        <PermissionGate requires={Permission.READ_DECKS}>
                            <DeckSummaries project={projectNumber} number={number} className="flex-1" />
                        </PermissionGate>
                    </div>
                </div>
                <PermissionGate requires={Permission.READ_REVIEWS}>
                    <FeedbackStatistics project={projectNumber} number={number} />
                </PermissionGate>
            </div>
        </div>
    );
}

type CardDetailProps = Omit<BaseElementProps, "children"> & { project: number; number: number };

// Continues the breadcrumb: which release this card sits in, coloured by how far that release has
// got. Absent until the card is placed in one; the pack name & print number live in the tooltip.
function ReleaseChip({ className, style, project: projectNumber, number }: ReleaseChipProps) {
    const navigate = useNavigate();
    const canReadReleases = usePermission(Permission.READ_RELEASES);
    const { data: project } = useGetProjectQuery({ number: projectNumber }, { skip: !canReadReleases });
    const { data: slot } = useGetSlotQuery({ project: projectNumber, number }, { skip: !canReadReleases });

    const release = useMemo(
        () => slot?.release && project?.releases.find((entry) => entry.code === slot.release?.code),
        [project?.releases, slot?.release]
    );

    if (!project || !slot?.release || !release) {
        return null;
    }

    // Publishing sets releasedDate without necessarily moving status off its last working value
    const displayStatus = release.releasedDate ? "released" : release.status;
    const finalNumber = getFinalCardNumber(project, slot);

    return (
        <TouchTooltip
            content={
                <div className="max-w-60 px-1 py-1 space-y-1">
                    <div className="font-cinzel uppercase tracking-wide text-xs">
                        {release.name} {finalNumber !== undefined && `#${finalNumber}`}
                    </div>
                    <div className="font-sans normal-case text-xs text-foreground/70 leading-snug">
                        {release.status === "released"
                            ? "This card has been released"
                            : "This card is scheduled for release"}
                    </div>
                </div>
            }
        >
            <Chip
                size="sm"
                variant="flat"
                color={releaseStatusColors[displayStatus]}
                className={classNames("cursor-pointer", className)}
                style={style}
                startContent={<FontAwesomeIcon icon={faLayerGroup} className="ml-1" />}
                onClick={() =>
                    navigate(`/project/${projectNumber}?tab=releases`, {
                        state: { highlight: highlightTarget.release(projectNumber, release.code) }
                    })
                }
            >
                {release.code}
            </Chip>
        </TouchTooltip>
    );
}
type ReleaseChipProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
};

function CardVersions({ className, style, project, number }: CardVersionsProps) {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project, number } });
    const [selectedIndex, setSelectedIndex] = useState<number | undefined>();
    const [searchParams] = useSearchParams();
    // Allows auto-selecting of specific version (eg. ?version=1.0.0)
    const version = searchParams.get("version") ?? undefined;
    const preselectedVersion = parseParamSemanticVersion(version);

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

    const selectedCard = useMemo(
        () => (selectedIndex ? sortedCards[selectedIndex] : undefined),
        [selectedIndex, sortedCards]
    );

    const widthClass = useMemo(
        () => (!cardsData?.items.some((card) => card.type === "plot") ? "w-64" : "w-98"),
        [cardsData?.items]
    );

    const tabs = useMemo(
        () =>
            sortedCards
                .map((card, index) => {
                    let label: string = card.version;
                    if (card.latest && card.released) {
                        label = "Release";
                    } else if (card.latest) {
                        label = "Latest";
                    } else if (card.draft) {
                        label = "Draft";
                    }
                    return <Tab key={index} title={<span className="text-base font-sans">{label}</span>} />;
                })
                .reverse(),
        [sortedCards]
    );

    const swipeHandlers = useSwipe((direction) => {
        setSelectedIndex((prev) => {
            if (prev !== undefined && direction === "right") {
                return prev > 0 ? prev - 1 : sortedCards.length - 1;
            } else if (prev !== undefined && direction === "left") {
                return prev < sortedCards.length - 1 ? prev + 1 : 0;
            }
            return prev;
        });
    });

    if (isLoading) {
        return (
            <div className={classNames("flex flex-col md:w-72", className)} style={style}>
                <Skeleton className="h-8 rounded-lg" />
                <LoadingCard className="m-2" />
            </div>
        );
    }
    return (
        <div className={classNames("flex flex-col md:w-72", className)} style={style}>
            <Tabs
                className="flex-row-reverse justify-end"
                selectedKey={String(selectedIndex)}
                onSelectionChange={(index) => setSelectedIndex(Number(index))}
                aria-label="Card Versions"
                variant="underlined"
                color="primary"
                destroyInactiveTabPanel={false}
            >
                {tabs}
            </Tabs>
            <div
                className="flex flex-col-reverse items-center justify-center sm:flex-row-reverse md:flex-col-reverse py-4"
                {...swipeHandlers}
            >
                <div
                    className={classNames(
                        "grid md:max-w-full -sm:ml-2 sm:mt-2 sm:self-start md:self-auto transition-all duration-600",
                        selectedCard?.note
                            ? "opacity-100 sm:max-w-1/2"
                            : "opacity-0 max-h-0 sm:max-w-0 sm:max-h-full md:max-h-0"
                    )}
                >
                    {sortedCards.map(
                        (card) =>
                            card.note && (
                                <div
                                    key={card.version}
                                    className={classNames(
                                        "grid col-start-1 row-start-1 overflow-hidden",
                                        selectedCard === card ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                                    )}
                                >
                                    <div
                                        className={classNames(
                                            "overflow-hidden flex flex-col bg-content2 transition-all duration-500 ease-in-out drop-shadow-2xl rounded-sm",
                                            selectedCard === card ? "opacity-100" : "opacity-0 -translate-y-2"
                                        )}
                                    >
                                        <div className="">
                                            <div
                                                className={classNames(
                                                    "pl-6 pr-3 py-2 text-lg tracking-wider font-cinzel uppercase w-full",
                                                    changeTypeClasses[card.note.type]
                                                )}
                                            >
                                                <FontAwesomeIcon icon={noteTypeIcon[card.note.type]} /> {card.note.type}
                                            </div>
                                            <NoteText text={card.note.text} />
                                        </div>
                                    </div>
                                </div>
                            )
                    )}
                </div>
                <div className="relative">
                    <CardStack
                        cards={sortedCards}
                        selectedIndex={selectedIndex}
                        tilt={-1}
                        className={classNames(
                            sortedCards.some((card) => card.type === "plot") ? "w-full" : "h-full",
                            widthClass
                        )}
                    >
                        {(card) => {
                            if (card.latest && card.released) {
                                return <CardImage card={card} />;
                            }
                            return <CardPreview card={renderPlaytestingCard(card)} />;
                        }}
                    </CardStack>
                    <CardStackActions project={project} number={number} className="absolute top-2 right-2 z-20" />
                </div>
            </div>
        </div>
    );
}

function NoteText({ text }: { text: string }) {
    const textRef = useRef<HTMLDivElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        if (textRef.current) {
            setIsOverflowing(textRef.current.scrollHeight > textRef.current.clientHeight);
        }
    }, [text]);

    return (
        <div className="pl-6 pr-3 py-4">
            <div className="relative">
                <div
                    ref={textRef}
                    className="text-sm tracking-wide text-foreground font-sans overflow-hidden transition-all duration-300"
                    // Collapsed height cap; tweak "8rem" to change how much note text shows before truncating.
                    style={{ maxHeight: isExpanded ? textRef.current?.scrollHeight : "8rem" }}
                >
                    {convertToNode(text)}
                </div>
                {!isExpanded && isOverflowing && (
                    <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-content2 to-transparent pointer-events-none" />
                )}
            </div>
            {isOverflowing && (
                <button
                    className="text-xs text-foreground/50 hover:text-default-600 mt-1"
                    onClick={() => setIsExpanded((prev) => !prev)}
                >
                    {isExpanded ? "Show less" : "Read more..."}
                </button>
            )}
        </div>
    );
}

type CardVersionsProps = Omit<BaseElementProps, "children"> & {
    selected?: SemanticVersion;
    project: number;
    number: number;
};

// Header row: the card-state icons plus Release Checks and Submit Review. On mobile the state icons
// fold into the actions dropdown, above its divider. Draft actions live over the card stack instead.
function ButtonSection({ className, style, project: projectNumber, number }: ButtonSectionProps) {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project: projectNumber, number } });
    const navigate = useNavigate();
    const canSubmitReview = usePermission(Permission.MAKE_REVIEWS);
    const canReadFeedback = usePermission(Permission.READ_RELEASE_CHECKS);
    const { data: slot } = useGetSlotQuery({ project: projectNumber, number }, { skip: !canReadFeedback });
    const [searchParams, setSearchParams] = useSearchParams();
    // Allows deep-linking straight into the modal (eg. the capsule buttons on the releases page)
    const [feedbackOpen, setFeedbackOpen] = useState(searchParams.get("releaseCheck") === "1");

    const closeFeedback = () => {
        setFeedbackOpen(false);
        if (searchParams.has("releaseCheck")) {
            const remaining = new URLSearchParams(searchParams);
            remaining.delete("releaseCheck");
            // Replaced, so closing isn't a history entry the back button reopens
            setSearchParams(remaining, { replace: true });
        }
    };

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
                            onPress: () => navigate(`/review/submit?project=${projectNumber}&number=${number}`)
                        }
                ]}
            />
            <ReleaseChecksModal isOpen={feedbackOpen} onClose={closeFeedback} project={projectNumber} number={number} />
        </div>
    );
}
type ButtonSectionProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
};

// Overlays New/Edit/Delete Draft on the top-right corner of the card stack preview
function CardStackActions({ className, style, project: projectNumber, number }: CardStackActionsProps) {
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
            icon: <FontAwesomeIcon icon={faFeather} size="lg" />,
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
        <div className={classNames("flex gap-1", className)} style={style}>
            {items.map((item) => (
                <TouchTooltip key={item.key} content={item.title}>
                    <Button isIconOnly size="sm" className="opacity-75" color={item.color} onPress={item.onPress}>
                        {item.icon}
                    </Button>
                </TouchTooltip>
            ))}
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
type CardStackActionsProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
};
