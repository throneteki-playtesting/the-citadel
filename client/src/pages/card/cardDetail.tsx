import { addToast, Skeleton, Tab, Tabs } from "@heroui/react";
import { BaseElementProps } from "../../types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGetCardQuery, useGetCardsQuery, useGetProjectQuery } from "../../api";
import { IPlaytestCard } from "common/models/cards";
import { cloneDeep } from "lodash-es";
import { CardPreview } from "@agot/card-preview";
import { getMostRecent, parseCardCode, renderPlaytestingCard, SemanticVersion } from "common/utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAngleLeft, faFeather, faPencil, faScroll, faTrash } from "@fortawesome/free-solid-svg-icons";
import { rcompare } from "semver";
import classNames from "classnames";
import CardImage from "../../components/cardImage";
import EditCardModal from "./editCardModal";
import DeleteCardModal from "./deleteCardModal";
import LoadingCard from "../../components/loadingCard";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import PermissionGate from "../../components/permissionGate";
import Permission from "common/models/permissions";
import { usePermission } from "../../hooks/usePermission";
import { useNavigate, useSearchParams } from "react-router-dom";
import DevelopmentStatus from "../../components/status/developmentStatus";
import ImageStatus from "../../components/status/imageStatus";
import GithubCardStatus from "../../components/status/githubCardStatus";
import DiscordCardStatus from "../../components/status/discordCardStatus";
import CardStack from "../../components/cardStack";
import { convertToNode, noteTypeIcon, parseParamSemanticVersion } from "../../utils";
import { changeTypeClasses } from "../../constants";
import HeaderActions from "../../components/actions/headerActions";
import DeckSummaries from "./deckSummaries";
import FeedbackStatistics from "./feedbackStatistics";
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
                    <PermissionedLink
                        to={`/project/${projectNumber}`}
                        className="text-lg sm:text-2xl tracking-widest text-secondary font-cinzel leading-tight hover:brightness-150 w-fit"
                        requires={Permission.READ_PROJECTS}
                    >
                        <FontAwesomeIcon icon={faAngleLeft} /> {project?.name}
                    </PermissionedLink>
                    <div className="text-2xl sm:text-4xl tracking-wider font-cinzel font-semibold text-primary">
                        Playtesting Card #{parseCardCode(false, projectNumber, number)}
                    </div>
                </div>
                <ButtonSection project={projectNumber} number={number} className="self-end sm:self-start" />
            </div>
            <div className="space-y-4">
                <div className="flex flex-col md:flex-row gap-2 w-full overflow-x-hidden">
                    <CardVersions project={projectNumber} number={number} className="z-10" />
                    <div className="flex flex-col gap-2 flex-1">
                        <StatusBoard project={projectNumber} number={number} />
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

function ButtonSection({ className, style, project: projectNumber, number }: ButtonSectionProps) {
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project: projectNumber, number } });
    const [editing, setEditing] = useState<IPlaytestCard>();
    const [deleting, setDeleting] = useState<IPlaytestCard>();
    const navigate = useNavigate();

    const canViewDiscord = usePermission(Permission.READ_DISCORD_CARD_FORUM);
    const canSubmitReview = usePermission(Permission.MAKE_REVIEWS);
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

    return (
        <div className={classNames(className)} style={style}>
            <HeaderActions
                items={[
                    canViewDiscord &&
                        !!latest?._metadata?.discord?.messageUrl && {
                            key: "discord",
                            title: "Join Discussion",
                            icon: <FontAwesomeIcon icon={faDiscord} />,
                            href: latest._metadata.discord.messageUrl.replace("https://", "discord://"),
                            openInNewTab: false
                        },
                    !isReleased &&
                        canSubmitReview && {
                            key: "submit-review",
                            title: "Submit Review",
                            icon: <FontAwesomeIcon icon={faScroll} />,
                            color: "primary",
                            onPress: () => navigate(`/review/submit?project=${projectNumber}&number=${number}`)
                        },
                    !isReleased &&
                        canCreateDraft &&
                        !draft &&
                        latest && {
                            key: "new-draft",
                            title: "New Draft",
                            icon: <FontAwesomeIcon icon={faFeather} />,
                            color: "primary",
                            onPress: () => onNewDraft(latest)
                        },
                    !isReleased &&
                        canEditDraft &&
                        draft && {
                            key: "edit-draft",
                            title: "Edit Draft",
                            icon: <FontAwesomeIcon icon={faPencil} />,
                            color: "secondary",
                            onPress: () => setEditing(draft)
                        },
                    !isReleased &&
                        canDeleteDraft &&
                        draft && {
                            key: "delete-draft",
                            title: "Delete Draft",
                            icon: <FontAwesomeIcon icon={faTrash} />,
                            color: "danger",
                            onPress: () => setDeleting(draft)
                        }
                ]}
            />
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
type ButtonSectionProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
};

function StatusBoard({ className, style, project, number }: StatusBoardProps) {
    return (
        <div
            className={classNames("py-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1", className)}
            style={style}
        >
            <DevelopmentStatus project={project} number={number} />
            <GithubCardStatus project={project} number={number} />
            <PermissionGate requires={Permission.SYNC_CARD_IMAGES}>
                <ImageStatus project={project} number={number} />
            </PermissionGate>
            <PermissionGate requires={Permission.SYNC_CARD_DISCORD}>
                <DiscordCardStatus project={project} number={number} />
            </PermissionGate>
        </div>
    );
}

type StatusBoardProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
};
