import { TrendRange, trendRanges } from "common/models/settings";
import { DAY_MS } from "../../constants";

export type { TrendRange };
export type TrendUnit = "day" | "week" | "month";

// The chart's own names for each span - the spans themselves are common/models/settings.ts's, which the
// settings route validates against
export const TREND_RANGES: { key: TrendRange; label: string; phrase?: string }[] = [
    { key: "week", label: "Week", phrase: "in the past week" },
    { key: "month", label: "Month", phrase: "in the past month" },
    { key: "year", label: "Year", phrase: "in the past year" },
    // No phrase - everything is "in all time", so the change beside the total would just repeat it
    { key: "all", label: "All time" }
];

export function isTrendRange(value: string | null | undefined): value is TrendRange {
    return trendRanges.includes(value as TrendRange);
}

const WEEK_MS = 7 * DAY_MS;
// "All time" steps up a unit once a finer one would crowd the line
const ALL_TIME_DAILY_UNTIL_DAYS = 31;
const ALL_TIME_WEEKLY_UNTIL_DAYS = 182;

export type TrendBuckets = { unit: TrendUnit; starts: Date[]; counts: number[]; since?: number };

function startOfDay(time: number) {
    const date = new Date(time);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

function evenBuckets(unit: TrendUnit, first: number, count: number, step: number) {
    return {
        unit,
        starts: Array.from({ length: count }, (_, index) => new Date(first + index * step)),
        indexOf: (time: number) => Math.floor((time - first) / step)
    };
}

function monthBuckets(first: number, now: number) {
    const from = new Date(first);
    const to = new Date(now);
    const count = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + 1;
    return {
        unit: "month" as const,
        starts: Array.from({ length: count }, (_, index) => new Date(from.getFullYear(), from.getMonth() + index, 1)),
        indexOf: (time: number) => {
            const date = new Date(time);
            return (date.getFullYear() - from.getFullYear()) * 12 + date.getMonth() - from.getMonth();
        }
    };
}

function layoutFor(range: TrendRange, times: number[], now: number) {
    const today = startOfDay(now);
    switch (range) {
        case "week":
            return evenBuckets("day", today - 6 * DAY_MS, 7, DAY_MS);
        case "month":
            return evenBuckets("day", today - 29 * DAY_MS, 30, DAY_MS);
        case "year":
            return evenBuckets("week", today - 51 * WEEK_MS, 52, WEEK_MS);
        case "all": {
            const earliest = startOfDay(times.length > 0 ? Math.min(...times) : now);
            const days = Math.round((today - earliest) / DAY_MS) + 1;
            if (days <= ALL_TIME_DAILY_UNTIL_DAYS) {
                // At least two points, or there's no line to draw
                const count = Math.max(2, days);
                return evenBuckets("day", today - (count - 1) * DAY_MS, count, DAY_MS);
            }
            if (days <= ALL_TIME_WEEKLY_UNTIL_DAYS) {
                const count = Math.ceil(days / 7);
                return evenBuckets("week", today - (count - 1) * WEEK_MS, count, WEEK_MS);
            }
            return monthBuckets(earliest, now);
        }
    }
}

/** New suggestions per day, week or month across a range - `since` is how many landed within it, for the
 *  change shown beside the total (left out for all time, where it would just be the total again). */
export function trendBuckets(range: TrendRange, times: number[], now: number): TrendBuckets {
    const layout = layoutFor(range, times, now);
    const counts = new Array<number>(layout.starts.length).fill(0);
    let since = 0;
    for (const time of times) {
        const index = layout.indexOf(time);
        if (index >= 0 && index < counts.length) {
            counts[index]++;
            since++;
        }
    }
    return { unit: layout.unit, starts: layout.starts, counts, since: range === "all" ? undefined : since };
}
