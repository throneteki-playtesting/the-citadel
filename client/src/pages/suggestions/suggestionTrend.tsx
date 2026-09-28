import { MouseEvent, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTweenedNumbers } from "../../hooks/useTween";
import { useSvgId } from "../../hooks/useSvgId";
import { TrendUnit } from "./trendRange";

const WIDTH = 460;
const HEIGHT = 130;
const PAD = { left: 4, right: 30, top: 10, bottom: 22 };

const LABEL_FADE = { duration: 0.3 } as const;

const CURRENT: Record<TrendUnit, string> = { day: "Today", week: "This week", month: "This month" };

// The short name for a point, as the axis gives it
function pointLabel(unit: TrendUnit, start: Date) {
    return unit === "month"
        ? start.toLocaleDateString(undefined, { month: "short", year: "numeric" })
        : start.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// The full name for a point, as its tooltip gives it
function pointTitle(unit: TrendUnit, start: Date) {
    return unit === "week" ? `Week of ${pointLabel(unit, start)}` : pointLabel(unit, start);
}

// How finely the line is traced across the chart - fine enough that straight runs between samples read as a curve
const SAMPLES = 181;

// The line's height at a fraction of the way across: an ease between neighbouring points with flat tangents at
// each, so it's smooth and never overshoots below zero
function curveAt(values: readonly number[], fraction: number) {
    if (values.length === 1) {
        return values[0];
    }
    const position = fraction * (values.length - 1);
    const index = Math.min(values.length - 2, Math.floor(position));
    const t = position - index;
    return values[index] + (values[index + 1] - values[index]) * t * t * (3 - 2 * t);
}

// The line traced at the same fixed places across the chart whatever its points, so a line with 7 points and
// one with 52 can ease straight into one another
function traceLine(values: readonly number[]) {
    return Array.from({ length: SAMPLES }, (_, sample) => curveAt(values, sample / (SAMPLES - 1)));
}

function tooltipAnchor(index: number, last: number) {
    if (index < last / 4) {
        return "0";
    }
    return index > (last * 3) / 4 ? "-100%" : "-50%";
}

/** New suggestions per day, week or month, as a line over a soft fill - hover a point for its count. */
export default function SuggestionTrend({ counts, starts, unit }: SuggestionTrendProps) {
    const targetMax = Math.max(4, Math.ceil(Math.max(...counts, 1) / 2) * 2);
    // Traced as heights - a fraction of the chart - rather than counts, since easing counts and scale apart
    // lets their ratio lurch whenever the scale changes a lot, flinging the line
    const traced = useMemo(() => traceLine(counts).map((value) => value / targetMax), [counts, targetMax]);
    const shown = useTweenedNumbers(traced);
    // Only the axis labels count along with the scale - the gridlines themselves hold still
    const [max] = useTweenedNumbers([targetMax]);
    const [hovered, setHovered] = useState<number>();
    const svgRef = useRef<SVGSVGElement>(null);
    const gradientId = useSvgId("trend");

    const last = counts.length - 1;
    const xAtFraction = (fraction: number) => PAD.left + fraction * (WIDTH - PAD.left - PAD.right);
    const xAt = (index: number) => xAtFraction(index / last);
    const yAtHeight = (height: number) => PAD.top + (1 - height) * (HEIGHT - PAD.top - PAD.bottom);
    const yAt = (value: number) => yAtHeight(value / targetMax);

    const line = shown
        .map((value, sample) => `${sample === 0 ? "M" : "L"}${xAtFraction(sample / (SAMPLES - 1))},${yAtHeight(value)}`)
        .join(" ");
    // The marked point sits on the line as drawn, so it rides along with it while the line eases
    const marked = hovered ?? last;
    const markedY = yAtHeight(curveAt(shown, marked / last));

    const onMove = (e: MouseEvent) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) {
            return;
        }
        const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
        const index = Math.round(((x - PAD.left) / (WIDTH - PAD.left - PAD.right)) * last);
        setHovered(Math.max(0, Math.min(last, index)));
    };

    return (
        <div className="relative pr-1">
            <svg
                ref={svgRef}
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="block w-full h-auto overflow-visible text-foreground"
                role="img"
                aria-label={`New suggestions per ${unit}, last ${counts.length} ${unit}s`}
            >
                <defs>
                    <linearGradient id={gradientId} x1={0} y1={0} x2={0} y2={1}>
                        <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                    </linearGradient>
                </defs>
                {[0, 0.5, 1].map((fraction) => (
                    <g key={fraction}>
                        <line
                            x1={PAD.left}
                            x2={WIDTH - PAD.right}
                            y1={yAtHeight(fraction)}
                            y2={yAtHeight(fraction)}
                            strokeDasharray={fraction === 0 ? undefined : "2 4"}
                            className="stroke-content3"
                        />
                        <text
                            x={WIDTH - PAD.right + 8}
                            y={yAtHeight(fraction)}
                            dominantBaseline="central"
                            fontSize={11}
                            className="fill-foreground/35 tabular-nums"
                        >
                            {Math.round(fraction * max)}
                        </text>
                    </g>
                ))}
                <AnimatePresence initial={false}>
                    {[0, Math.round(last / 2), last].map((index, slot) => {
                        const label = index === last ? CURRENT[unit] : pointLabel(unit, starts[index]);
                        return (
                            <motion.text
                                key={`${slot}:${label}`}
                                x={xAt(index)}
                                y={HEIGHT - 4}
                                textAnchor={slot === 0 ? "start" : slot === 2 ? "end" : "middle"}
                                fontSize={11}
                                className="fill-foreground/35"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={LABEL_FADE}
                            >
                                {label}
                            </motion.text>
                        );
                    })}
                </AnimatePresence>
                <path d={`${line} L${xAt(last)},${yAt(0)} L${xAt(0)},${yAt(0)} Z`} fill={`url(#${gradientId})`} />
                <path
                    d={line}
                    fill="none"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="stroke-foreground/85"
                />
                {hovered !== undefined && (
                    <line
                        x1={xAt(hovered)}
                        x2={xAt(hovered)}
                        y1={PAD.top}
                        y2={yAt(0)}
                        className="stroke-foreground/35"
                    />
                )}
                <circle
                    cx={xAt(marked)}
                    cy={markedY}
                    r={4.5}
                    strokeWidth={2}
                    className="fill-foreground stroke-background"
                />
                <rect
                    width={WIDTH}
                    height={HEIGHT}
                    fill="transparent"
                    onMouseMove={onMove}
                    onMouseLeave={() => setHovered(undefined)}
                />
            </svg>
            {hovered !== undefined && (
                <div
                    className="absolute pointer-events-none whitespace-nowrap rounded-md border border-content3 bg-content1 px-2 py-1 text-xs shadow-lg"
                    style={{
                        left: `${(xAt(hovered) / WIDTH) * 100}%`,
                        top: `calc(${(yAt(counts[hovered]) / HEIGHT) * 100}% - 0.5rem)`,
                        transform: `translate(${tooltipAnchor(hovered, last)}, -100%)`
                    }}
                >
                    <span className="text-foreground/50">
                        {hovered === last ? CURRENT[unit] : pointTitle(unit, starts[hovered])}
                    </span>{" "}
                    · <span className="font-semibold tabular-nums">{counts[hovered]}</span> submitted
                </div>
            )}
        </div>
    );
}

type SuggestionTrendProps = {
    counts: number[];
    starts: Date[];
    unit: TrendUnit;
};
