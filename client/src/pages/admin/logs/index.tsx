import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Chip, DatePicker, Select, SelectItem, Skeleton, Spinner } from "@heroui/react";
import { CalendarDateTime } from "@internationalized/date";
import { useGetLogsQuery } from "../../../api";
import { ILogEntry, LogCategory, LogSeverity, logCategories, logSeverities } from "common/models/logs";
import usePageTitle from "../../../hooks/usePageTitle";
import { useTagManagerOverrides } from "../../../hooks/useTagManagerOverrides";
import useTimezone from "../../../hooks/useTimezone";
import LogMessage from "./logMessage";
import { subscribeToLogCreates } from "./logStream";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faScroll, faXmarkCircle } from "@fortawesome/free-solid-svg-icons";

const PER_PAGE = 20;
const SKELETON_ROW_COUNT = 16;

// Shared grid track sizing so the summary row's columns line up consistently top to bottom.
const ROW_GRID_COLS = "grid grid-cols-[10rem_6rem_1fr_1rem]";

function mergeItems(a: ILogEntry[], b: ILogEntry[]): ILogEntry[] {
    const byId = new Map<string, ILogEntry>();
    [...a, ...b].forEach((item) => byId.set(item.id, item));
    return [...byId.values()].sort((x, y) => new Date(y.created).getTime() - new Date(x.created).getTime());
}

function formatLogTimestamp(date: Date, timezone: string): string {
    return new Date(date).toLocaleString(navigator.language, {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}

const categoryItems = logCategories.map((category) => ({ key: category, label: category }));
const severityItems = logSeverities.map((severity) => ({ key: severity, label: severity }));

const severityColors: Record<LogSeverity, "default" | "warning" | "danger"> = {
    info: "default",
    warn: "warning",
    error: "danger"
};

const severityRowClasses: Record<LogSeverity, string> = {
    info: "border-content3",
    warn: "border-warning/30 bg-warning/10",
    error: "border-danger/30 bg-danger/10"
};

export default function Logs() {
    usePageTitle("Logs");
    useTagManagerOverrides({ autoRefresh: true });

    const { timezone } = useTimezone();

    const [categories, setCategories] = useState<LogCategory[]>([]);
    const [severities, setSeverities] = useState<LogSeverity[]>([]);
    const [dateFrom, setDateFrom] = useState<CalendarDateTime | null>(null);
    const [dateTo, setDateTo] = useState<CalendarDateTime | null>(null);
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<ILogEntry[]>([]);
    const [pending, setPending] = useState<ILogEntry[]>([]);
    const [expandedId, setExpandedId] = useState<string>();

    const [everOpenedIds, setEverOpenedIds] = useState<Set<string>>(new Set());
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const isAtTopRef = useRef(true);
    // Tracks rows which have just arrived via SSE push to highlight
    const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());
    const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const markFlashing = useCallback((id: string) => {
        setFlashingIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

        const existingTimer = flashTimersRef.current.get(id);
        if (existingTimer) clearTimeout(existingTimer);

        flashTimersRef.current.set(id, setTimeout(() => {
            flashTimersRef.current.delete(id);
            setFlashingIds((prev) => {
                if (!prev.has(id)) return prev;
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }, 2000));
    }, []);

    useEffect(() => {
        const timers = flashTimersRef.current;
        return () => timers.forEach((timer) => clearTimeout(timer));
    }, []);

    const dateBounds = useMemo(() => {
        if (!dateFrom && !dateTo) return undefined;
        return {
            from: dateFrom ? dateFrom.toDate(timezone) : undefined,
            to: dateTo ? dateTo.toDate(timezone) : undefined
        };
    }, [dateFrom, dateTo, timezone]);

    const filter = useMemo(() => {
        const f: Record<string, unknown> = {};
        if (categories.length > 0) f.category = { $in: categories };
        if (severities.length > 0) f.severity = { $in: severities };
        if (dateBounds) {
            const created: Record<string, Date> = {};
            if (dateBounds.from) created.$gte = dateBounds.from;
            if (dateBounds.to) created.$lte = dateBounds.to;
            f.created = created;
        }
        return Object.keys(f).length > 0 ? f : undefined;
    }, [categories, severities, dateBounds]);

    const { data, isFetching } = useGetLogsQuery({ filter, orderBy: { created: "desc" }, page, perPage: PER_PAGE });

    useEffect(() => {
        if (!data) return;
        setItems((prev) => (page === 1 ? mergeItems(data.items, []) : mergeItems(prev, data.items)));
        setHasLoadedOnce(true);
    }, [data, page]);

    // Reset pagination & buffer when filter changes, and smooth-scroll to top
    useEffect(() => {
        setPage(1);
        setPending([]);
        isAtTopRef.current = true;
        containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, [categories, severities, dateBounds]);

    const handleScroll = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        isAtTopRef.current = el.scrollTop < 4;
    }, []);

    const flushPending = useCallback(() => {
        setItems((prev) => mergeItems(prev, pending));
        setPending([]);
        containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, [pending]);

    // Merges in live if scrolled to top, otherwise buffers behind the "N new logs" pill.
    useEffect(() => subscribeToLogCreates((entry) => {
        if (categories.length > 0 && !categories.includes(entry.category)) return;
        if (severities.length > 0 && !severities.includes(entry.severity)) return;
        if (dateBounds) {
            const created = new Date(entry.created).getTime();
            if (dateBounds.from && created < dateBounds.from.getTime()) return;
            if (dateBounds.to && created > dateBounds.to.getTime()) return;
        }

        markFlashing(entry.id);

        if (isAtTopRef.current) {
            setItems((prev) => mergeItems([entry], prev));
        } else {
            setPending((prev) => mergeItems([entry], prev));
        }
    }), [categories, severities, dateBounds, markFlashing]);

    const isFetchingRef = useRef(isFetching);
    isFetchingRef.current = isFetching;
    const itemsLengthRef = useRef(items.length);
    itemsLengthRef.current = items.length;
    const totalRef = useRef(data?.total);
    totalRef.current = data?.total;

    // Loads the next page once the bottom sentinel scrolls into view.
    useEffect(() => {
        const root = containerRef.current;
        const sentinel = sentinelRef.current;
        if (!root || !sentinel) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !isFetchingRef.current && itemsLengthRef.current < (totalRef.current ?? 0)) {
                setPage((prev) => prev + 1);
            }
        }, { root, threshold: 0 });

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasLoadedOnce]);

    // Tops up with another page if the sentinel is still visible after one lands (short pages).
    useEffect(() => {
        if (isFetchingRef.current) return;
        if (items.length >= (data?.total ?? 0)) return;

        const root = containerRef.current;
        const sentinel = sentinelRef.current;
        if (!root || !sentinel) return;

        const rootRect = root.getBoundingClientRect();
        const sentinelRect = sentinel.getBoundingClientRect();
        const isVisible = sentinelRect.top < rootRect.bottom && sentinelRect.bottom > rootRect.top;
        if (isVisible) {
            setPage((prev) => prev + 1);
        }
    }, [items, data?.total]);

    const isRefreshing = isFetching && page === 1 && hasLoadedOnce;
    const isLoadingMore = isFetching && page > 1;
    const hasActiveFilters = categories.length > 0 || severities.length > 0 || !!dateFrom || !!dateTo;

    const toggleExpanded = useCallback((id: string) => {
        setExpandedId((prev) => (prev === id ? undefined : id));
        setEverOpenedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    }, []);

    const clearFilters = useCallback(() => {
        setCategories([]);
        setSeverities([]);
        setDateFrom(null);
        setDateTo(null);
    }, []);

    if (!hasLoadedOnce) {
        return <LogsSkeleton />;
    }

    return (
        <div className="space-y-2">
            <div className="font-cinzel text-2xl">Activity Logs</div>
            <div className="text-sm md:text-base">A live feed of important actions taken across the site, along with the user or integration responsible.</div>
            <Card className="border-1 border-content3 p-4 gap-3">
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
                    <DatePicker
                        label="From"
                        granularity="minute"
                        className="w-full sm:w-56 shrink-0"
                        value={dateFrom}
                        onChange={setDateFrom}
                        maxValue={dateTo ?? undefined}
                        endContent={dateFrom && (
                            <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                aria-label="Clear from date"
                                onPress={() => setDateFrom(null)}
                            >
                                <FontAwesomeIcon icon={faXmarkCircle} className="text-default-400" />
                            </Button>
                        )}
                    />
                    <DatePicker
                        label="To"
                        granularity="minute"
                        className="w-full sm:w-56 shrink-0"
                        value={dateTo}
                        onChange={setDateTo}
                        minValue={dateFrom ?? undefined}
                        endContent={dateTo && (
                            <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                aria-label="Clear to date"
                                onPress={() => setDateTo(null)}
                            >
                                <FontAwesomeIcon icon={faXmarkCircle} className="text-default-400" />
                            </Button>
                        )}
                    />
                    <Select
                        label="Category"
                        className="w-full sm:w-48 shrink-0"
                        selectionMode="multiple"
                        items={categoryItems}
                        selectedKeys={categories}
                        onSelectionChange={(keys) => setCategories([...keys] as LogCategory[])}
                        renderValue={(selected) => (
                            <div className="flex flex-wrap gap-1">
                                {selected.map((item) => (
                                    <Chip key={item.key} size="sm" variant="flat" className="capitalize">{item.data?.label}</Chip>
                                ))}
                            </div>
                        )}
                    >
                        {(item) => <SelectItem key={item.key} className="capitalize">{item.label}</SelectItem>}
                    </Select>
                    <Select
                        label="Severity"
                        className="w-full sm:w-48 shrink-0"
                        selectionMode="multiple"
                        items={severityItems}
                        selectedKeys={severities}
                        onSelectionChange={(keys) => setSeverities([...keys] as LogSeverity[])}
                        renderValue={(selected) => (
                            <div className="flex flex-wrap gap-1">
                                {selected.map((item) => (
                                    <Chip key={item.key} size="sm" variant="flat" color={severityColors[item.key as LogSeverity]} className="capitalize">
                                        {item.data?.label}
                                    </Chip>
                                ))}
                            </div>
                        )}
                    >
                        {(item) => <SelectItem key={item.key} className="capitalize">{item.label}</SelectItem>}
                    </Select>
                    {isRefreshing && (
                        <div className="flex items-center gap-2 text-xs text-default-500">
                            <Spinner size="sm" aria-label="Refreshing" />
                        </div>
                    )}
                </div>
                <div className="relative">
                    {pending.length > 0 && (
                        <div className="absolute top-2 inset-x-0 flex justify-center z-20">
                            <Button size="sm" color="primary" variant="shadow" onPress={flushPending}>
                                {pending.length} new log{pending.length !== 1 ? "s" : ""} ↑
                            </Button>
                        </div>
                    )}
                    <div
                        ref={containerRef}
                        onScroll={handleScroll}
                        className="h-[70vh] overflow-y-auto border border-content3"
                    >
                        {items.map((entry) => (
                            <LogRow
                                key={entry.id}
                                entry={entry}
                                timezone={timezone}
                                isExpanded={expandedId === entry.id}
                                hasOpened={everOpenedIds.has(entry.id)}
                                isFlashing={flashingIds.has(entry.id)}
                                onToggle={() => toggleExpanded(entry.id)}
                            />
                        ))}
                        <div ref={sentinelRef} className="h-4" />
                        {isLoadingMore && (
                            <div className="flex justify-center py-4">
                                <Spinner size="sm" aria-label="Loading more" />
                            </div>
                        )}
                        {!isFetching && items.length === 0 && (
                            <div className="flex flex-col items-center gap-2 text-center text-default-500 py-12">
                                <FontAwesomeIcon icon={faScroll} className="text-2xl opacity-50" />
                                {hasActiveFilters ? (
                                    <>
                                        <div className="text-sm">No logs match these filters.</div>
                                        <Button size="sm" variant="light" onPress={clearFilters}>Clear filters</Button>
                                    </>
                                ) : (
                                    <div className="text-sm">No logs have been made yet.</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}

function LogRow({ entry, timezone, isExpanded, hasOpened, isFlashing, onToggle }: {
    entry: ILogEntry;
    timezone: string;
    isExpanded: boolean;
    hasOpened: boolean;
    isFlashing: boolean;
    onToggle: () => void;
}) {
    return (
        <div className={classNames("border-b", severityRowClasses[entry.severity])}>
            <button
                type="button"
                aria-expanded={isExpanded}
                onClick={onToggle}
                className={classNames(
                    ROW_GRID_COLS,
                    "w-full items-center gap-3 px-4 py-3 text-left cursor-pointer transition-all duration-700 ring-2 ring-inset",
                    isFlashing ? "ring-primary bg-primary/10" : "ring-transparent"
                )}
            >
                <span className="font-mono text-xs text-foreground/50">{formatLogTimestamp(new Date(entry.created), timezone)}</span>
                <Chip size="sm" variant="flat" color={severityColors[entry.severity]} className="capitalize justify-center">
                    {entry.severity}
                </Chip>
                <div className="min-w-0 text-sm"><LogMessage entry={entry} /></div>
                <FontAwesomeIcon icon={faChevronLeft} className={classNames("text-foreground/50 transition-transform duration-200", { "-rotate-90": isExpanded })} />
            </button>
            <div className={classNames("grid transition-[grid-template-rows] duration-200 ease-out", isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                <div className="overflow-hidden">
                    {hasOpened && (
                        <pre className="max-h-64 overflow-auto m-2 p-2 bg-content2 rounded-md text-xs">
                            {JSON.stringify({
                                id: entry.id,
                                category: entry.category,
                                action: entry.action,
                                principal: entry.principal,
                                context: entry.context,
                                details: entry.details
                            }, null, 2)}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    );
}

function SkeletonRow() {
    return (
        <div className={classNames(ROW_GRID_COLS, "items-center gap-3 px-4 py-3 border-b border-content3")}>
            <Skeleton className="w-40 h-4 rounded-sm" />
            <Skeleton className="w-16 h-6 rounded-full" />
            <Skeleton className="h-4 rounded-sm" />
        </div>
    );
}

function LogsSkeleton() {
    return (
        <div className="space-y-2">
            <Skeleton className="w-56 h-8 rounded-sm" />
            <Skeleton className="w-full max-w-xl h-5 rounded-sm" />
            <Card className="border-1 border-content3 p-4 gap-3">
                <div className="flex flex-wrap gap-2">
                    <Skeleton className="w-64 h-14 rounded-md" />
                    <Skeleton className="w-64 h-14 rounded-md" />
                    <Skeleton className="w-48 h-14 rounded-md" />
                    <Skeleton className="w-48 h-14 rounded-md" />
                </div>
                <div className="h-[70vh] overflow-hidden border border-content3 rounded-lg">
                    {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => <SkeletonRow key={index} />)}
                </div>
            </Card>
        </div>
    );
}
