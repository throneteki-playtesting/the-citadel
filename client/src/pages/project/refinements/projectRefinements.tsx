import { useCallback, useMemo, useRef, useState } from "react";
import { Button, Chip, Divider, Input, ScrollShadow, Skeleton, Switch } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookOpen, faChevronRight, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import classNames from "classnames";
import { Link, useSearchParams } from "react-router-dom";
import { IProject, IProjectRelease } from "common/models/projects";
import { designStatuses, DesignStatus, ISlotRefinement } from "common/models/slots";
import {
    inquirySeverities,
    InquirySeverity,
    isCheckStale,
    isInquiryOpen,
    isInquiryStale,
    MAX_REFINEMENT_REQUIREMENTS,
    refinementRequirements
} from "common/models/refinement";
import { getFinalCardNumber, parseCardCode, typeNames } from "common/utils";
import { designStagePct } from "common/progress/calc";
import { truncateHtml } from "common/richText/truncate";
import { IPlaytestCard } from "common/models/cards";
import { useGetCardsQuery, useGetSlotRefinementsQuery } from "../../../api";
import { ScopeParams, useSearchParamsScope } from "../../../hooks/useSearchParamsScope";
import { designLane, factionAccentClasses, inquirySeverityMeta, reorderTransition } from "../../../constants";
import SectionTitle from "../../../components/sectionTitle";
import { FilterChip, FilterRow } from "../../../components/filterChips";
import SortSelect from "../../../components/sortSelect";
import SlidingPages from "../../../components/slidingPages";
import { TouchTooltip } from "../../../components/touchTooltip";
import UserAvatar from "../../../components/userAvatar";
import ProgressRing from "../../../components/progressRing";
import ThronesIcon from "../../../components/thronesIcon";
import RichText from "../../../components/richText";
import InquiryChip from "../../../components/refinement/inquiryChip";
import { RefinementChecklistItems } from "../../card/refinement/refinementChecklist";
import { ChecklistDots } from "../../../components/checklist";
import RefinementTab from "../../card/refinement/refinementTab";
import { useAuth } from "../../../hooks/useAuth";

const URL_OWNED_KEYS = ["status", "severity", "releases", "attention", "mine", "sort", "q", "editing"];
const UNASSIGNED = "unassigned";
const FAQ_PREVIEW_LENGTH = 240;

const sortOptions = {
    number: "Card Number",
    open: "Most Outstanding",
    status: "Design Status"
} as const;
type SortOption = keyof typeof sortOptions;

const REFINEMENTS_DESCRIPTION =
    "Every card in the project and what refinement still has outstanding on it. Filter by release to narrow to one pack.";

type RefinementRow = {
    slot: ISlotRefinement;
    card?: IPlaytestCard;
    openCount: number;
    staleCount: number;
    severities: Set<InquirySeverity>;
};

type FilterAxis = "status" | "severity" | "release";

/** One line of the list. Headers sit in the same run as rows so neither can unmount the other */
type ListEntry =
    | { kind: "header"; key: string; label: string; count: number }
    | { kind: "row"; key: string; row: RefinementRow; release?: IProjectRelease };

export default function ProjectRefinements({ project, isActive }: ProjectRefinementsProps) {
    const { data: slotsData, isLoading } = useGetSlotRefinementsQuery({ project: project.number });
    const { data: cardsData } = useGetCardsQuery({ filter: { project: project.number, latest: true } });
    const { user } = useAuth();

    const [searchParams] = useSearchParams();

    const [status, setStatus] = useState<DesignStatus | "all">(() => {
        const raw = searchParams.get("status");
        return raw && designStatuses.includes(raw as DesignStatus) ? (raw as DesignStatus) : "all";
    });
    const [severity, setSeverity] = useState<InquirySeverity | "all">(() => {
        const raw = searchParams.get("severity");
        return raw && inquirySeverities.includes(raw as InquirySeverity) ? (raw as InquirySeverity) : "all";
    });
    const [releases, setReleases] = useState<string[]>(
        () => searchParams.get("releases")?.split(",").filter(Boolean) ?? []
    );
    const [attentionOnly, setAttentionOnly] = useState(() => searchParams.get("attention") === "true");
    const [mineOnly, setMineOnly] = useState(() => searchParams.get("mine") === "true");
    const [sortBy, setSortBy] = useState<SortOption>(() => (searchParams.get("sort") as SortOption | null) ?? "number");
    const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
    const [editingNumber, setEditingNumber] = useState<number | undefined>(() => {
        const raw = Number(searchParams.get("editing"));
        return Number.isInteger(raw) && raw > 0 ? raw : undefined;
    });
    const [isEditing, setIsEditing] = useState(() => editingNumber !== undefined);
    const [highlightInquiry, setHighlightInquiry] = useState<number>();

    const containerRef = useRef<HTMLDivElement>(null);

    const scopeParams = useMemo((): ScopeParams => {
        const params: ScopeParams = Object.fromEntries(URL_OWNED_KEYS.map((key) => [key, undefined]));
        if (status !== "all") {
            params.status = status;
        }
        if (severity !== "all") {
            params.severity = severity;
        }
        if (releases.length > 0) {
            params.releases = releases.join(",");
        }
        if (attentionOnly) {
            params.attention = "true";
        }
        if (mineOnly) {
            params.mine = "true";
        }
        if (sortBy !== "number") {
            params.sort = sortBy;
        }
        if (search.trim()) {
            params.q = search.trim();
        }
        if (isEditing && editingNumber !== undefined) {
            params.editing = String(editingNumber);
        }
        return params;
    }, [status, severity, releases, attentionOnly, mineOnly, sortBy, search, isEditing, editingNumber]);
    useSearchParamsScope("refinements", isActive, scopeParams);

    const cardsByNumber = useMemo(
        () => new Map((cardsData?.items ?? []).map((card) => [card.number, card])),
        [cardsData?.items]
    );

    const releasesByCode = useMemo(
        () => new Map(project.releases.map((release) => [release.code, release])),
        [project.releases]
    );

    const rows = useMemo((): RefinementRow[] => {
        return (slotsData?.items ?? []).map((slot) => {
            const open = slot.inquiries.filter(isInquiryOpen);
            return {
                slot,
                card: cardsByNumber.get(slot.number),
                openCount: open.length,
                staleCount: open.filter((inquiry) => isInquiryStale(inquiry, slot.version)).length,
                severities: new Set(open.map((inquiry) => inquiry.severity))
            };
        });
    }, [slotsData?.items, cardsByNumber]);

    // A chip's count reflects everything else filtering rather than itself, so turning one on never
    // shows a number the list cannot produce
    const matches = useCallback(
        (row: RefinementRow, ignore?: FilterAxis) => {
            if (ignore !== "status" && status !== "all" && row.slot.designStatus !== status) {
                return false;
            }
            if (ignore !== "severity" && severity !== "all" && !row.severities.has(severity)) {
                return false;
            }
            if (
                ignore !== "release" &&
                releases.length > 0 &&
                !releases.includes(row.slot.release?.code ?? UNASSIGNED)
            ) {
                return false;
            }
            if (attentionOnly && row.openCount === 0 && row.staleCount === 0) {
                return false;
            }
            if (mineOnly) {
                const mine =
                    row.slot.inquiries.some((inquiry) => inquiry.createdBy === user?.discordId) ||
                    row.slot.refinementChecks.some((check) => check.createdBy === user?.discordId);
                if (!mine) {
                    return false;
                }
            }
            const term = search.trim().toLowerCase();
            if (term) {
                const name = row.card?.name?.toLowerCase() ?? "";
                const code = parseCardCode(false, row.slot.project, row.slot.number).toLowerCase();
                if (!name.includes(term) && !code.includes(term)) {
                    return false;
                }
            }
            return true;
        },
        [status, severity, releases, attentionOnly, mineOnly, user?.discordId, search]
    );

    // Filtering to releases re-sorts by printed number, since that is the order the pack is read in
    const isReleaseFiltered = releases.length > 0 && !releases.includes(UNASSIGNED);

    const visible = useMemo(() => {
        const filtered = rows.filter((row) => matches(row));
        const comparators: Record<SortOption, (a: RefinementRow, b: RefinementRow) => number> = {
            number: (a, b) => {
                if (isReleaseFiltered) {
                    const finalA = getFinalCardNumber(project, a.slot) ?? Number.MAX_SAFE_INTEGER;
                    const finalB = getFinalCardNumber(project, b.slot) ?? Number.MAX_SAFE_INTEGER;
                    if (finalA !== finalB) {
                        return finalA - finalB;
                    }
                }
                return a.slot.number - b.slot.number;
            },
            open: (a, b) => b.openCount - a.openCount || a.slot.number - b.slot.number,
            status: (a, b) =>
                designStatuses.indexOf(a.slot.designStatus) - designStatuses.indexOf(b.slot.designStatus) ||
                a.slot.number - b.slot.number
        };
        return [...filtered].sort(comparators[sortBy]);
    }, [rows, matches, sortBy, isReleaseFiltered, project]);

    // One flat run of headers and rows rather than rows nested per group, so a row keeps its layout-animation
    // identity whatever the grouping does around it
    const entries = useMemo((): ListEntry[] => {
        // The release only rides on a row while the list is ungrouped. Once headers name it, repeating the
        // code on every row beneath says nothing the header did not already say
        const asRow = (row: RefinementRow, release?: IProjectRelease): ListEntry => ({
            kind: "row",
            key: `row-${row.slot.number}`,
            row,
            release
        });

        if (releases.length === 0) {
            return visible.map((row) => asRow(row, releasesByCode.get(row.slot.release?.code ?? "")));
        }

        const byCode = new Map<string, RefinementRow[]>();
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

    const releaseOptions = useMemo(
        () => [...[...project.releases].sort((a, b) => a.number - b.number).map((entry) => entry.code), UNASSIGNED],
        [project.releases]
    );
    // `inquiry` names the one to land on. A prop rather than router state: the editor is a page of this
    // component, so the request never leaves it or gets exposed to everything else rewriting the url
    const onEdit = (row: RefinementRow, inquiry?: number) => {
        setEditingNumber(row.slot.number);
        setHighlightInquiry(inquiry);
        setIsEditing(true);
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    if (isLoading) {
        return <RefinementsSkeleton project={project} />;
    }

    return (
        <div ref={containerRef} className="scroll-mt-20">
            <SlidingPages currentPage={isEditing ? 2 : 1}>
                {renderList()}
                <div>
                    {editingNumber !== undefined && (
                        <RefinementTab
                            key={editingNumber}
                            project={project.number}
                            number={editingNumber}
                            highlightInquiry={highlightInquiry}
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
                <div className="text-sm text-foreground/50">{REFINEMENTS_DESCRIPTION}</div>
                <SectionTitle size="lg">Refinements</SectionTitle>

                <div className="flex flex-col gap-1.5">
                    <FilterRow label="Status">
                        {designStatuses.map((entry) => (
                            <FilterChip
                                key={entry}
                                label={designLane.meta[entry].label}
                                count={
                                    rows.filter((row) => matches(row, "status") && row.slot.designStatus === entry)
                                        .length
                                }
                                isActive={status === entry}
                                onPress={() => setStatus(status === entry ? "all" : entry)}
                            />
                        ))}
                    </FilterRow>

                    <FilterRow label="Severity">
                        {inquirySeverities.map((entry) => (
                            <FilterChip
                                key={entry}
                                label={inquirySeverityMeta[entry].label}
                                count={
                                    rows.filter((row) => matches(row, "severity") && row.severities.has(entry)).length
                                }
                                isActive={severity === entry}
                                onPress={() => setSeverity(severity === entry ? "all" : entry)}
                            />
                        ))}
                    </FilterRow>

                    <FilterRow label="Release">
                        {releaseOptions.map((code) => (
                            <FilterChip
                                key={code}
                                label={code === UNASSIGNED ? "Unassigned" : code}
                                count={
                                    rows.filter(
                                        (row) =>
                                            matches(row, "release") && (row.slot.release?.code ?? UNASSIGNED) === code
                                    ).length
                                }
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
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <Input
                        size="sm"
                        className="sm:flex-1 sm:shrink sm:max-w-96"
                        placeholder="Filter by card name, number, etc...."
                        value={search}
                        onValueChange={setSearch}
                        isClearable
                        startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="text-foreground/40" />}
                    />
                    <div className="flex flex-1 flex-wrap items-center justify-between gap-2 sm:shrink-0">
                        <div className="flex items-center gap-3">
                            <Switch size="sm" isSelected={attentionOnly} onValueChange={setAttentionOnly}>
                                <span className="text-xs whitespace-nowrap">Needs attention</span>
                            </Switch>
                            <Switch size="sm" isSelected={mineOnly} onValueChange={setMineOnly}>
                                <span className="text-xs whitespace-nowrap">Mine</span>
                            </Switch>
                        </div>
                        <SortSelect
                            options={sortOptions}
                            value={sortBy}
                            className="ml-auto w-40 sm:w-44"
                            onChange={setSortBy}
                        />
                    </div>
                </div>

                {entries.length === 0 ? (
                    <div className="rounded-md border border-dashed border-content3 p-8 text-center text-sm text-foreground/50">
                        No cards match these filters.
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        <AnimatePresence mode="popLayout" initial={false}>
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
                                        <RefinementRowView
                                            row={entry.row}
                                            release={entry.release}
                                            showFinalNumber={isReleaseFiltered}
                                            project={project}
                                            onEdit={(inquiry) => onEdit(entry.row, inquiry)}
                                        />
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        );
    }
}

/**
 * One card's refinement at a glance. The same children at every size - a row from sm up, stacked below
 * it - so a phone is never shown different data from a desktop, only a different arrangement.
 */
function RefinementRowView({ row, release, showFinalNumber, project, onEdit }: RefinementRowProps) {
    const { slot } = row;
    const step = designLane.meta[slot.designStatus];
    const currentChecks = slot.refinementChecks.filter((check) => !isCheckStale(check, slot.version));
    const requirements = refinementRequirements(slot.inquiries, slot.refinementChecks, slot.version);
    const finalNumber = showFinalNumber ? getFinalCardNumber(project, slot) : undefined;
    const name = row.card?.name ?? `Card #${slot.number}`;

    return (
        <div className="flex items-stretch gap-2 sm:gap-3 pr-1 sm:pr-2 rounded-md border border-content3 bg-content1 overflow-hidden">
            <div className={classNames("w-1.5 shrink-0", factionAccentClasses[slot.faction])} />
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
                <ProgressRing value={designStagePct(slot.designStatus)} className="size-10 self-center cursor-help">
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
                        to={`/project/${slot.project}/${slot.number}`}
                        className="truncate text-sm hover:text-primary hover:underline"
                    >
                        {name}
                    </Link>
                    {finalNumber !== undefined && (
                        <span className="shrink-0 font-mono text-xs text-foreground/40 tabular-nums">
                            #{finalNumber}
                        </span>
                    )}
                    {release && (
                        <TouchTooltip content={release.name}>
                            <Chip size="sm" variant="flat" className="shrink-0 cursor-help">
                                {release.code}
                            </Chip>
                        </TouchTooltip>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:contents">
                    <div className="shrink-0 flex items-center gap-1.5 justify-start sm:justify-end sm:w-20">
                        {currentChecks.length > 0 ? (
                            <>
                                {currentChecks.slice(0, 3).map((check) => (
                                    <UserAvatar
                                        key={check.createdBy}
                                        discordId={check.createdBy}
                                        title="Checked this card"
                                        className="!size-6"
                                    />
                                ))}
                                {currentChecks.length > 3 && (
                                    <span className="text-[.65rem] text-foreground/50">
                                        +{currentChecks.length - 3}
                                    </span>
                                )}
                            </>
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
                        className="flex-1 min-w-0 flex items-center gap-0.5 whitespace-nowrap"
                    >
                        {slot.inquiries.length === 0 ? (
                            <span className="text-foreground/30">—</span>
                        ) : (
                            slot.inquiries.map((inquiry) => (
                                <InquiryChip
                                    key={inquiry.inquiry}
                                    inquiry={inquiry}
                                    version={slot.version}
                                    onPress={() => onEdit(inquiry.inquiry)}
                                />
                            ))
                        )}
                    </ScrollShadow>

                    {slot.faq && (
                        <TouchTooltip
                            content={
                                <div className="max-w-64 py-0.5 flex flex-col gap-1">
                                    <span className="font-cinzel uppercase tracking-wide text-sm">FAQ Notes</span>
                                    <div className="text-xs text-foreground/70">
                                        <RichText html={truncateHtml(slot.faq, FAQ_PREVIEW_LENGTH)} />
                                    </div>
                                </div>
                            }
                        >
                            <FontAwesomeIcon
                                icon={faBookOpen}
                                aria-label="Has FAQ notes"
                                className="shrink-0 w-4 text-foreground/40 cursor-help"
                            />
                        </TouchTooltip>
                    )}

                    <Divider
                        orientation="vertical"
                        className="hidden sm:block self-stretch h-auto w-px shrink-0 bg-content3/60"
                    />

                    <TouchTooltip
                        content={
                            <div className="max-w-64 py-0.5 flex flex-col gap-1 text-xs">
                                <span className="font-cinzel uppercase tracking-wide text-sm">
                                    Refinement Checklist
                                </span>
                                <RefinementChecklistItems requirements={requirements} />
                            </div>
                        }
                    >
                        <ChecklistDots tasks={requirements.map(({ done }) => done)} max={MAX_REFINEMENT_REQUIREMENTS} />
                    </TouchTooltip>
                </div>
            </div>

            <Button
                isIconOnly
                size="sm"
                variant="light"
                aria-label={`View refinement for ${name}`}
                className="self-center shrink-0 size-6 min-w-6 sm:size-8 sm:min-w-8 text-foreground/40"
                onPress={() => onEdit()}
            >
                <FontAwesomeIcon icon={faChevronRight} />
            </Button>
        </div>
    );
}

function RefinementsSkeleton({ project }: { project: IProject }) {
    const rowCount = Object.values(project.cardCount).reduce((total, count) => total + count, 0);

    return (
        <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-48 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
            <div className="flex flex-col gap-1.5">
                {Array.from({ length: Math.min(rowCount, 12) }).map((_, index) => (
                    <Skeleton key={index} className="h-14 rounded-md" />
                ))}
            </div>
        </div>
    );
}

type ProjectRefinementsProps = { project: IProject; isActive: boolean };

type RefinementRowProps = {
    row: RefinementRow;
    release?: IProjectRelease;
    showFinalNumber: boolean;
    project: IProject;
    /** The inquiry to land on, if the row was opened by clicking one */
    onEdit: (inquiry?: number) => void;
};
