import { useCallback, useMemo, useRef, useState } from "react";
import { Avatar, Button, Chip, Divider, Input, ScrollShadow, Skeleton, Switch } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faEye,
    faImage,
    faListCheck,
    faMagnifyingGlass,
    faPencil,
    faXmarkCircle
} from "@fortawesome/free-solid-svg-icons";
import { faCircle, faCircleCheck } from "@fortawesome/free-regular-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { typeNames } from "common/utils";
import classNames from "classnames";
import { IProject, IProjectRelease } from "common/models/projects";
import { ArtworkStatus, artworkStatuses, ArtworkType, artworkTypes } from "common/models/slots";
import { isPrepDone } from "common/models/artwork";
import Permission from "common/models/permissions";
import { useGetArtistsQuery, useGetCardsQuery, useGetSlotArtworksQuery, useGetUserQuery } from "../../../api";
import { usePermission } from "../../../hooks/usePermission";
import { useAuth } from "../../../hooks/useAuth";
import {
    artworkLane,
    artworkTypeIcons,
    artworkTypeNames,
    factionAccentClasses,
    reorderTransition
} from "../../../constants";
import ProgressRing from "../../../components/progressRing";
import UserAvatar from "../../../components/userAvatar";
import SectionTitle from "../../../components/sectionTitle";
import SortSelect from "../../../components/sortSelect";
import ThronesIcon from "../../../components/thronesIcon";
import { TouchTooltip } from "../../../components/touchTooltip";
import ArtworkImage from "../../../components/artwork/artworkImage";
import ArtworkFocus from "../../../components/artwork/artworkFocus";
import ArtworkTab from "../../card/artwork/artworkTab";
import { ArtworkChecklistItems } from "../../card/artwork/artworkChecklist";
import SlidingPages from "../../../components/slidingPages";
import { buildArtworkRows, IArtworkRow, needsAttention, searchHaystack } from "./artworkSummary";

const UNASSIGNED = "unassigned";

const ARTWORKS_DESCRIPTION =
    "Every card's artwork at a glance - how it is being obtained, who it is coming from, and what is still holding it up. Open one to record options, permission and preparation.";

const sortOptions = {
    number: "Card Number",
    name: "Card Name",
    status: "Status",
    artist: "Artist",
    attention: "Needs Attention"
} as const;

type SortOption = keyof typeof sortOptions;

/** The axes with their own chip row, each of which counts itself against the others - see `matches` */
type FilterAxis = "status" | "type" | "release";

/** One line of the list. Headers sit in the same run as rows so neither can unmount the other */
type ListEntry =
    | { kind: "header"; key: string; label: string; count: number }
    | { kind: "row"; key: string; row: IArtworkRow; release?: IProjectRelease };

export default function ProjectArtworks({ project }: ProjectArtworksProps) {
    const { data: slotsData, isLoading } = useGetSlotArtworksQuery({ project: project.number });
    const { data: cardsData } = useGetCardsQuery({ filter: { project: project.number, latest: true } });
    const canReadArtists = usePermission(Permission.READ_ARTISTS);
    const { data: artistsData } = useGetArtistsQuery(undefined, { skip: !canReadArtists });
    const { user } = useAuth();

    const [status, setStatus] = useState<ArtworkStatus | "all">("all");
    const [type, setType] = useState<ArtworkType | "all">("all");
    const [releases, setReleases] = useState<string[]>([]);
    const [attentionOnly, setAttentionOnly] = useState(false);
    const [assignedToMe, setAssignedToMe] = useState(false);
    const [sortBy, setSortBy] = useState<SortOption>("number");
    const [search, setSearch] = useState("");
    // Which card the editor holds, kept apart from whether the editor is the page on show. Clearing it on
    // the way back would empty the page mid-slide, so you would watch it vanish rather than leave
    const [editing, setEditing] = useState<IArtworkRow>();
    const [isEditing, setIsEditing] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);

    const onEdit = (row: IArtworkRow) => {
        setEditing(row);
        setIsEditing(true);
        // Editing something near the foot of a long list would otherwise slide the editor in below the
        // fold, leaving whoever opened it looking at the bottom of a form they have not seen the top of
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const rows = useMemo(
        // Blanket permission can't be read without the artist list, so the checklist is left to the card page
        () =>
            buildArtworkRows(slotsData?.items ?? [], cardsData?.items ?? [], artistsData?.items ?? [], {
                includeRequirements: canReadArtists
            }),
        [slotsData?.items, cardsData?.items, artistsData?.items, canReadArtists]
    );

    const releasesByCode = useMemo(
        () => new Map(project.releases.map((release) => [release.code, release])),
        [project.releases]
    );

    const releaseOptions = useMemo(
        () => [...[...project.releases].sort((a, b) => a.number - b.number).map((entry) => entry.code), UNASSIGNED],
        [project.releases]
    );

    // Whether a row survives the filters, optionally ignoring one axis - so a chip's count reflects
    // everything else filtering rather than itself
    const matches = useCallback(
        (row: IArtworkRow, ignore?: FilterAxis) => {
            const artwork = row.slot.artwork;
            const term = search.trim().toLowerCase();

            if (ignore !== "status" && status !== "all" && artwork.status !== status) {
                return false;
            }
            if (ignore !== "type" && type !== "all" && artwork.type !== type) {
                return false;
            }
            if (
                ignore !== "release" &&
                releases.length > 0 &&
                !releases.includes(row.slot.release?.code ?? UNASSIGNED)
            ) {
                return false;
            }
            if (attentionOnly && !needsAttention(row)) {
                return false;
            }
            if (assignedToMe && artwork.assignee !== user?.discordId) {
                return false;
            }
            if (term.length > 0 && !searchHaystack(row).includes(term)) {
                return false;
            }
            return true;
        },
        [status, type, releases, attentionOnly, assignedToMe, user?.discordId, search]
    );

    const counts = useMemo(() => {
        const tally = {
            status: Object.fromEntries(artworkStatuses.map((entry) => [entry, 0])) as Record<ArtworkStatus, number>,
            type: Object.fromEntries([...artworkTypes, UNASSIGNED].map((entry) => [entry, 0])) as Record<
                string,
                number
            >,
            release: {} as Record<string, number>
        };
        for (const row of rows) {
            const artwork = row.slot.artwork;
            if (matches(row, "status")) {
                tally.status[artwork.status] += 1;
            }
            if (matches(row, "type")) {
                tally.type[artwork.type ?? UNASSIGNED] += 1;
            }
            if (matches(row, "release")) {
                const code = row.slot.release?.code ?? UNASSIGNED;
                tally.release[code] = (tally.release[code] ?? 0) + 1;
            }
        }
        return tally;
    }, [rows, matches]);

    const visible = useMemo(() => {
        const filtered = rows.filter((row) => matches(row));

        const byNumber = (a: IArtworkRow, b: IArtworkRow) => a.slot.number - b.slot.number;
        const comparators: Record<SortOption, (a: IArtworkRow, b: IArtworkRow) => number> = {
            number: byNumber,
            name: (a, b) => a.name.localeCompare(b.name) || byNumber(a, b),
            // Least finished first, since the point of sorting by status is finding what still needs doing
            status: (a, b) => a.percent - b.percent || byNumber(a, b),
            artist: (a, b) => (a.artist?.name ?? "~").localeCompare(b.artist?.name ?? "~") || byNumber(a, b),
            attention: (a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || byNumber(a, b)
        };

        return [...filtered].sort(comparators[sortBy]);
    }, [rows, matches, sortBy]);

    // One flat run of headers and rows rather than rows nested per group, so a row keeps its layout-animation
    // identity whatever the grouping does around it. Release order, then everything without one.
    const entries = useMemo((): ListEntry[] => {
        // The release only rides on a row while the list is ungrouped. Once headers name it, repeating the
        // code on every row beneath says nothing the header did not already say
        const asRow = (row: IArtworkRow, release?: IProjectRelease): ListEntry => ({
            kind: "row",
            key: `row-${row.slot.number}`,
            row,
            release
        });

        if (releases.length === 0) {
            return visible.map((row) => asRow(row, releasesByCode.get(row.slot.release?.code ?? "")));
        }

        const byCode = new Map<string, IArtworkRow[]>();
        for (const row of visible) {
            const code = row.slot.release?.code ?? UNASSIGNED;
            const group = byCode.get(code);
            if (group) {
                group.push(row);
            } else {
                byCode.set(code, [row]);
            }
        }

        return [...byCode.entries()]
            .sort(([a], [b]) => {
                if (a === UNASSIGNED || b === UNASSIGNED) {
                    return a === UNASSIGNED ? 1 : -1;
                }
                return (releasesByCode.get(a)?.number ?? 0) - (releasesByCode.get(b)?.number ?? 0);
            })
            .flatMap(([code, rowsInRelease]): ListEntry[] => [
                {
                    kind: "header",
                    key: `header-${code}`,
                    label: releasesByCode.get(code)?.name ?? "Unassigned",
                    count: rowsInRelease.length
                },
                ...rowsInRelease.map((row) => asRow(row))
            ]);
    }, [visible, releases, releasesByCode]);

    if (isLoading) {
        return <ArtworksSkeleton project={project} />;
    }

    // The editor is a place you travel to and come back from, rather than a layer over the list - the
    // artwork detail is far too tall to sit in a dialog comfortably
    return (
        <div ref={containerRef} className="scroll-mt-20">
            <SlidingPages currentPage={isEditing ? 2 : 1}>
                {renderList()}
                <div>
                    {editing && (
                        <ArtworkTab
                            key={editing.slot.number}
                            project={project.number}
                            number={editing.slot.number}
                            showTrack
                            onBack={() => setIsEditing(false)}
                        />
                    )}
                </div>
            </SlidingPages>
        </div>
    );

    function renderList() {
        return (
            <div className="flex flex-col gap-3">
                <div className="text-sm text-foreground/50">{ARTWORKS_DESCRIPTION}</div>
                <SectionTitle size="lg">Artworks</SectionTitle>
                <div className="flex flex-col gap-1.5">
                    <FilterRow label="Status">
                        {artworkStatuses.map((entry) => (
                            <FilterChip
                                key={entry}
                                label={artworkLane.meta[entry].label}
                                count={counts.status[entry]}
                                isActive={status === entry}
                                onPress={() => setStatus(status === entry ? "all" : entry)}
                            />
                        ))}
                    </FilterRow>
                    <FilterRow label="Type">
                        {artworkTypes.map((entry) => (
                            <FilterChip
                                key={entry}
                                label={artworkTypeNames[entry]}
                                count={counts.type[entry]}
                                isActive={type === entry}
                                onPress={() => setType(type === entry ? "all" : entry)}
                            />
                        ))}
                    </FilterRow>
                    {project.releases.length > 0 && (
                        <FilterRow label="Release">
                            {releaseOptions.map((code) => (
                                <FilterChip
                                    key={code}
                                    label={code === UNASSIGNED ? "Unassigned" : code}
                                    count={counts.release[code] ?? 0}
                                    isActive={releases.includes(code)}
                                    onPress={() =>
                                        setReleases(
                                            releases.includes(code)
                                                ? releases.filter((entry) => entry !== code)
                                                : [...releases, code]
                                        )
                                    }
                                />
                            ))}
                        </FilterRow>
                    )}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-b border-content3 pb-2">
                    <Input
                        size="sm"
                        className="sm:flex-1 sm:shrink sm:max-w-96"
                        placeholder="Filter by name, artist, notes, etc...."
                        value={search}
                        onValueChange={setSearch}
                        startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="text-foreground/40" />}
                        endContent={
                            search ? (
                                <button aria-label="Clear search" onClick={() => setSearch("")}>
                                    <FontAwesomeIcon icon={faXmarkCircle} className="text-default-400" />
                                </button>
                            ) : null
                        }
                    />
                    <div className="flex-1 flex items-center flex-wrap justify-between gap-2 sm:shrink-0">
                        <div className="flex items-center gap-2">
                            <Switch size="sm" isSelected={attentionOnly} onValueChange={setAttentionOnly}>
                                <span className="text-xs whitespace-nowrap">Needs attention</span>
                            </Switch>
                            {user && user.discordId !== "anonymous" && (
                                <Switch size="sm" isSelected={assignedToMe} onValueChange={setAssignedToMe}>
                                    <span className="text-xs whitespace-nowrap">Assigned to me</span>
                                </Switch>
                            )}
                        </div>
                        <SortSelect
                            options={sortOptions}
                            value={sortBy}
                            className="ml-auto w-40 sm:w-44"
                            onChange={setSortBy}
                        />
                    </div>
                </div>
                {visible.length === 0 ? (
                    <div className="p-8 text-center text-sm text-foreground/50 border border-dashed border-content3 rounded-md">
                        No cards match these filters.
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        <AnimatePresence initial={false} mode="popLayout">
                            {entries.map((entry) => (
                                <motion.div
                                    key={entry.key}
                                    layout
                                    className={classNames("w-full", entry.kind === "header" && "pt-2")}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={reorderTransition}
                                >
                                    {entry.kind === "header" ? (
                                        <div className="flex items-center gap-2 px-1">
                                            <span className="font-cinzel uppercase tracking-wide text-foreground/60 text-xs">
                                                {entry.label}
                                            </span>
                                            <span className="text-xs text-foreground/40">
                                                {entry.count} card{entry.count === 1 ? "" : "s"}
                                            </span>
                                        </div>
                                    ) : (
                                        <ArtworkRow
                                            row={entry.row}
                                            release={entry.release}
                                            onEdit={() => onEdit(entry.row)}
                                        />
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
                <div className="text-xs text-foreground/40 text-center border-t border-content3 pt-1.5">
                    {visible.length} of {rows.length} cards
                </div>
            </div>
        );
    }
}

type ProjectArtworksProps = { project: IProject };

// The page's own shape while the slots load, sized from the project's cached slot tally so the list
// settles into the space it was already holding rather than shoving the page down as it arrives
function ArtworksSkeleton({ project }: { project: IProject }) {
    const rowCount = Object.values(project.cardCount).reduce((total, count) => total + count, 0);

    return (
        <div className="flex flex-col gap-3">
            <div className="text-sm text-foreground/50">{ARTWORKS_DESCRIPTION}</div>
            <SectionTitle size="lg">Artworks</SectionTitle>
            <div className="flex flex-col gap-1.5">
                {[artworkStatuses.length, artworkTypes.length, project.releases.length].map((chips, row) =>
                    chips > 0 ? (
                        <div key={row} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                            <Skeleton className="h-3 w-14 shrink-0 rounded-sm" />
                            <div className="flex gap-1.5">
                                {Array.from({ length: chips }, (_, chip) => (
                                    <Skeleton key={chip} className="h-6 w-24 rounded-full" />
                                ))}
                            </div>
                        </div>
                    ) : null
                )}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-b border-content3 pb-2">
                <Skeleton className="h-10 w-full sm:flex-1 sm:max-w-96 rounded-md" />
                <div className="flex items-center justify-between gap-2 sm:shrink-0">
                    <Skeleton className="h-6 w-32 rounded-md" />
                    <Skeleton className="h-8 w-40 sm:w-44 rounded-md" />
                </div>
            </div>
            <div className="flex flex-col gap-1.5">
                {Array.from({ length: rowCount }, (_, row) => (
                    <Skeleton key={row} className="h-14 w-full rounded-md" />
                ))}
            </div>
            <div className="border-t border-content3 pt-1.5 flex justify-center">
                <Skeleton className="h-3 w-24 rounded-sm" />
            </div>
        </div>
    );
}

/** One filter axis. On a phone the chips scroll rather than wrap, so the row cannot push the list away */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span className="sm:w-14 shrink-0 sm:text-right text-[0.65rem] uppercase tracking-widest text-foreground/40">
                {label}
            </span>
            <ScrollShadow
                orientation="horizontal"
                hideScrollBar
                className="flex gap-1.5 py-0.5 sm:flex-wrap sm:overflow-visible"
            >
                {children}
            </ScrollShadow>
        </div>
    );
}

function FilterChip({ label, count, isActive, onPress }: FilterChipProps) {
    return (
        <Chip
            as="button"
            size="sm"
            variant={isActive ? "solid" : "bordered"}
            color={isActive ? "primary" : "default"}
            className="shrink-0 cursor-pointer"
            onClick={onPress}
            endContent={<span className="px-1.5 text-xs tabular-nums rounded-full bg-foreground/10 ml-1">{count}</span>}
        >
            {label}
        </Chip>
    );
}

type FilterChipProps = {
    label: string;
    count: number;
    isActive: boolean;
    onPress: () => void;
};

/** One card's artwork at a glance - a scrolling table from sm up, a stacked card below it */
function ArtworkRow({ row, release, onEdit }: ArtworkRowProps) {
    const artwork = row.slot.artwork;
    const step = artworkLane.meta[artwork.status];
    // Read-only for a READ_ARTWORKS-only visitor - the row still opens, just to look rather than to change
    const canEdit = usePermission(Permission.EDIT_ARTWORKS);

    return (
        <div className="flex items-stretch gap-2 sm:gap-3 pr-1 sm:pr-2 rounded-md border border-content3 bg-content1 overflow-hidden">
            <div className={classNames("w-1.5 shrink-0", factionAccentClasses[row.slot.faction])} />
            <TouchTooltip
                content={
                    <div className="max-w-56 px-1 py-0.5">
                        <div className="text-sm font-cinzel">
                            <FontAwesomeIcon icon={step.icon} /> {step.label}
                        </div>
                        <div className="text-xs">{step.description}</div>
                    </div>
                }
            >
                <ProgressRing value={row.percent} className="size-10 self-center cursor-help">
                    <FontAwesomeIcon icon={step.icon} className="text-sm text-primary" />
                </ProgressRing>
            </TouchTooltip>
            <div className="flex-1 min-w-0 py-2 flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-0.5">
                <div className="sm:w-48 md:w-56 lg:w-72 shrink-0 min-w-0 flex items-center gap-1.5">
                    {row.card && (
                        <TouchTooltip content={typeNames[row.card.type]}>
                            <ThronesIcon name={row.card.type} className="shrink-0 text-foreground/50 cursor-help" />
                        </TouchTooltip>
                    )}
                    <Link
                        to={`/project/${row.slot.project}/${row.slot.number}`}
                        className="truncate text-sm hover:text-primary hover:underline"
                    >
                        {row.name}
                    </Link>
                    {release && (
                        <TouchTooltip content={release.name}>
                            <Chip size="sm" variant="flat" className="shrink-0 cursor-help">
                                {release.code}
                            </Chip>
                        </TouchTooltip>
                    )}
                </div>
                <div className="shrink-0 flex items-center gap-2 justify-start sm:justify-end">
                    <Assignee id={artwork.assignee} />
                    {artwork.type ? (
                        <TouchTooltip content={artworkTypeNames[artwork.type]}>
                            <span className="flex items-center gap-1.5 text-foreground/50 cursor-help">
                                <FontAwesomeIcon icon={artworkTypeIcons[artwork.type]} className="w-5 text-xl" />
                                <span className="sm:hidden text-xs">{artworkTypeNames[artwork.type]}</span>
                            </span>
                        </TouchTooltip>
                    ) : (
                        <span className="w-5 text-center text-foreground/30">—</span>
                    )}
                </div>
                <Divider
                    orientation="vertical"
                    className="hidden sm:block self-stretch h-auto w-px shrink-0 bg-content3/60"
                />
                <ScrollShadow
                    orientation="horizontal"
                    hideScrollBar
                    className="flex-1 min-w-0 flex items-center gap-1.5 text-xs text-foreground/60 whitespace-nowrap"
                >
                    {row.details.map((detail, index) => (
                        <span key={detail} className="flex items-center gap-1.5">
                            {index > 0 && <span className="text-foreground/25">·</span>}
                            {detail}
                        </span>
                    ))}
                </ScrollShadow>
                <Attention row={row} />
            </div>
            <div className="shrink-0 self-center flex flex-col sm:flex-row items-center justify-center gap-0.5">
                {row.finalUrl ? (
                    <FinalArtwork url={row.finalUrl} name={row.name} />
                ) : (
                    <span aria-hidden className="hidden sm:block size-6" />
                )}
                <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    aria-label={canEdit ? `Edit artwork for ${row.name}` : `View artwork for ${row.name}`}
                    className="shrink-0 size-6 min-w-6 sm:size-8 sm:min-w-8 text-foreground/40"
                    onPress={onEdit}
                >
                    <FontAwesomeIcon icon={canEdit ? faPencil : faEye} />
                </Button>
            </div>
        </div>
    );
}

type ArtworkRowProps = {
    row: IArtworkRow;
    release?: IProjectRelease;
    onEdit: () => void;
};

function FinalArtwork({ url, name }: { url: string; name: string }) {
    const [origin, setOrigin] = useState<DOMRect>();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const alt = `Final artwork for ${name}`;

    return (
        <>
            <TouchTooltip
                content={
                    <div className="w-56 p-1 pointer-events-none">
                        <ArtworkImage url={url} alt={alt} ratio="square" />
                    </div>
                }
                closeDelay={0}
            >
                <span className="inline-flex">
                    <motion.button
                        ref={triggerRef}
                        type="button"
                        aria-label={`View ${alt}`}
                        className="size-6 flex items-center justify-center text-success cursor-zoom-in"
                        whileHover={{ scale: 0.97 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => setOrigin(triggerRef.current?.getBoundingClientRect())}
                    >
                        <FontAwesomeIcon icon={faImage} />
                    </motion.button>
                </span>
            </TouchTooltip>
            <ArtworkFocus origin={origin} url={url} alt={alt} onClose={() => setOrigin(undefined)} />
        </>
    );
}

// Empty state drawn at the same size as a filled one, so the type icon beside it never has to jump
function Assignee({ id }: { id?: string }) {
    if (!id) {
        return <span aria-hidden className="size-6 rounded-full border border-dashed border-content3/60" />;
    }
    return <AssigneeAvatar discordId={id} />;
}

// A second useGetUserQuery subscription (same cache key as UserAvatar's own) just for the tooltip's name/username
function AssigneeAvatar({ discordId }: { discordId: string }) {
    const { data: user } = useGetUserQuery({ discordId });

    return (
        <TouchTooltip
            content={
                <div className="max-w-56 px-1 py-0.5 flex flex-col gap-1">
                    <span className="text-[0.65rem] uppercase tracking-wide text-foreground/40">Assigned to</span>
                    <div className="flex items-center gap-2">
                        <Avatar size="sm" src={user?.avatarUrl} alt={user?.displayname} />
                        <div className="min-w-0 flex flex-col">
                            <span className="truncate text-small">{user?.displayname ?? "…"}</span>
                            {user?.username && (
                                <span className="truncate text-tiny text-foreground/40">{user.username}</span>
                            )}
                        </div>
                    </div>
                </div>
            }
        >
            <UserAvatar discordId={discordId} title="" className="!size-6 text-[0.6rem] cursor-help" />
        </TouchTooltip>
    );
}

/** The card's checklist as one dot per task, with the editor's own rows behind it in the tooltip */
function Attention({ row }: { row: IArtworkRow }) {
    // Prep is one dot, as the checklist draws it; the strip is sized for a full four so rows stay aligned
    const tasks = [...row.requirements.map(({ done }) => done), ...(row.prep.length > 0 ? [isPrepDone(row.prep)] : [])];
    if (tasks.length === 0) {
        return null;
    }

    // The rule belongs to the checklist, not the row, so it goes when the checklist has nothing to show too
    return (
        <>
            <Divider
                orientation="vertical"
                className="hidden sm:block self-stretch h-auto w-px shrink-0 bg-content3/60"
            />
            <TouchTooltip
                content={
                    <div className="max-w-64 py-0.5 flex flex-col gap-1 text-xs">
                        <span className="font-cinzel uppercase tracking-wide text-sm">Artwork Checklist</span>
                        <ArtworkChecklistItems requirements={row.requirements} prep={row.prep} />
                    </div>
                }
            >
                <div
                    className="shrink-0 flex items-center justify-start gap-1 w-20 text-xs cursor-help"
                    aria-label={`${row.remaining} of ${tasks.length} tasks remaining`}
                >
                    <FontAwesomeIcon icon={faListCheck} className="w-4 text-foreground/40" />
                    {tasks.map((done, task) => (
                        <FontAwesomeIcon
                            key={task}
                            icon={done ? faCircleCheck : faCircle}
                            className={classNames("w-3", done ? "text-success" : "text-foreground/30")}
                        />
                    ))}
                </div>
            </TouchTooltip>
        </>
    );
}
