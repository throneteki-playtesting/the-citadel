import { KeyboardEvent, MouseEvent, ReactElement, useRef, useState } from "react";
import classNames from "classnames";
import { Faction, factions, Type, types } from "common/models/cards";
import { factionNames, thronesColors, thronesFontColors, thronesIcons, typeNames } from "common/utils";
import ThronesIcon from "../../components/thronesIcon";
import { averageByType, CountGrid, emptyGrid, expectedCount } from "./spreadCounts";
import {
    isCellSelected,
    isFactionPartlySelected,
    isFactionSelected,
    SpreadSelection,
    toggleSelection
} from "./spreadSelection";
import { EASE_STANDARD } from "../../constants";
import { useTween } from "../../hooks/useTween";

const SIZE = 480;
const CENTRE = SIZE / 2;
const INNER = { from: 76, to: 152 };
const OUTER = { from: 155, to: 228 };
const DOT_RADIUS = 235;
// The shortest arc (px, at the ring's midline) an icon is drawn in - anything smaller is left to the tooltip
const MIN_ICON_ARC = 17;

// How far each type's segment is shaded from its faction's own colour, towards that faction's text
// colour - small enough that every segment still reads as its faction (Targaryen never nears Stark's grey)
const TYPE_SHADE: Record<Type, number> = {
    character: 0,
    location: 0.05,
    attachment: 0.1,
    event: 0.15,
    plot: 0.2,
    agenda: 0.25
};

const TWEEN = { duration: 0.7, ease: EASE_STANDARD } as const;

const SEGMENT_STROKE_CLASSES =
    "stroke-default-400 group-hover:stroke-foreground group-focus-visible:stroke-primary group-focus-visible:[stroke-width:3]";

function isBelowExpected(grid: CountGrid, faction: Faction, type: Type, neutralWeight: number) {
    const count = grid[faction][type];
    const expected = expectedCount(averageByType(grid), faction, type, neutralWeight);
    return count > 0 && expected > 0 && count < expected;
}

const factionTotal = (grid: CountGrid, faction: Faction) => types.reduce((sum, type) => sum + grid[faction][type], 0);

function lerpGrid(from: CountGrid, to: CountGrid, progress: number): CountGrid {
    const grid = emptyGrid();
    for (const faction of factions) {
        for (const type of types) {
            grid[faction][type] = from[faction][type] + (to[faction][type] - from[faction][type]) * progress;
        }
    }
    return grid;
}

function toRgb(hex: string) {
    return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
}

function mixHex(from: string, to: string, amount: number) {
    const a = toRgb(from);
    const b = toRgb(to);
    return `#${a
        .map((value, i) =>
            Math.round(value + (b[i] - value) * amount)
                .toString(16)
                .padStart(2, "0")
        )
        .join("")}`;
}

function shadeFor(faction: Faction, type: Type) {
    return mixHex(thronesColors[faction], thronesFontColors[faction], TYPE_SHADE[type]);
}

function arcPath(from: number, to: number, start: number, end: number) {
    const large = end - start > Math.PI ? 1 : 0;
    const point = (radius: number, angle: number) =>
        `${CENTRE + radius * Math.cos(angle)},${CENTRE + radius * Math.sin(angle)}`;
    return [
        `M${point(to, start)}`,
        `A${to},${to} 0 ${large} 1 ${point(to, end)}`,
        `L${point(from, end)}`,
        `A${from},${from} 0 ${large} 0 ${point(from, start)}`,
        "Z"
    ].join(" ");
}

function polar(radius: number, angle: number) {
    return { x: CENTRE + radius * Math.cos(angle), y: CENTRE + radius * Math.sin(angle) };
}

// x/y are only known for a pointer - keyboard focus drives the centre readout alone, with no tooltip
type Focus = { faction: Faction; type?: Type; x?: number; y?: number; flipX?: boolean; flipY?: boolean };

/** Faction on the inner ring, card type on the outer, sized by count, with a dot marking a segment below what's
 *  expected (see expectedCount). Clicking picks segments - Ctrl/Cmd adds to or removes from what's picked. */
export default function SpreadSunburst({ counts, neutralWeight, selection, onSelectionChange }: SpreadSunburstProps) {
    const { shown, previous, progress } = useTween(counts, { lerp: lerpGrid, transition: TWEEN });
    const [focus, setFocus] = useState<Focus>();
    const containerRef = useRef<HTMLDivElement>(null);

    const shownTotal = factions.reduce((sum, faction) => sum + factionTotal(shown, faction), 0);
    const averages = averageByType(counts);

    const hover = (next: Pick<Focus, "faction" | "type">) => (e: MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) {
            return;
        }
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        // Past either middle the tooltip opens back towards the centre, so it never hangs off the chart's
        // own edges - where whatever holds the page would clip it
        setFocus({ ...next, x, y, flipX: x > rect.width / 2, flipY: y > rect.height / 2 });
    };
    const hasSelection = selection.size > 0;
    const selectedTotal = factions.reduce(
        (sum, faction) =>
            sum +
            types.reduce(
                (total, type) => total + (isCellSelected(selection, faction, type) ? counts[faction][type] : 0),
                0
            ),
        0
    );

    const segmentProps = (faction: Faction, type: Type | undefined, count: number) => {
        const visibleTypes = types.filter((t) => counts[faction][t] > 0);
        const select = (additive: boolean) =>
            onSelectionChange(toggleSelection(selection, faction, type, additive, visibleTypes));
        const label = `${factionNames[faction]}${type ? ` ${typeNames[type]}` : ""}: ${count}`;
        const isSelected = type ? isCellSelected(selection, faction, type) : isFactionSelected(selection, faction);
        // A faction with only some of its types picked stays half-lit, so it still reads as involved
        const isPartial = !type && isFactionPartlySelected(selection, faction);
        return {
            role: "button",
            tabIndex: 0,
            "aria-label": label,
            "aria-pressed": isSelected,
            className: classNames(
                "group cursor-pointer outline-none transition-opacity duration-200",
                hasSelection && !isSelected && (isPartial ? "opacity-60" : "opacity-25")
            ),
            onMouseEnter: hover({ faction, type }),
            onMouseMove: hover({ faction, type }),
            onMouseLeave: () => setFocus(undefined),
            onFocus: () => setFocus({ faction, type }),
            onBlur: () => setFocus(undefined),
            onClick: (e: MouseEvent) => select(e.ctrlKey || e.metaKey),
            onKeyDown: (e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(e.ctrlKey || e.metaKey);
                }
            }
        };
    };

    const rings: ReactElement[] = [];
    const dots: ReactElement[] = [];
    let angle = -Math.PI / 2;
    for (const faction of factions) {
        const total = factionTotal(shown, faction);
        if (total <= 0.001) {
            continue;
        }
        const span = (total / shownTotal) * Math.PI * 2;
        const middle = polar((INNER.from + INNER.to) / 2, angle + span / 2);
        const room = span * ((INNER.from + INNER.to) / 2);
        rings.push(
            <g key={faction} {...segmentProps(faction, undefined, factionTotal(counts, faction))}>
                <path
                    d={arcPath(INNER.from, INNER.to, angle, angle + span)}
                    fill={thronesColors[faction]}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    className={SEGMENT_STROKE_CLASSES}
                />
                {room >= MIN_ICON_ARC && (
                    <text
                        x={middle.x}
                        y={middle.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={Math.max(14, Math.min(30, room * 0.62))}
                        fill={thronesFontColors[faction]}
                        className="font-thronesdb pointer-events-none"
                    >
                        {thronesIcons[faction]}
                    </text>
                )}
            </g>
        );

        let typeAngle = angle;
        for (const type of types) {
            const count = shown[faction][type];
            if (count <= 0.001) {
                continue;
            }
            const typeSpan = (count / shownTotal) * Math.PI * 2;
            const middleAngle = typeAngle + typeSpan / 2;
            const iconRadius = (OUTER.from + OUTER.to) / 2;
            const iconArc = typeSpan * iconRadius;
            const icon = polar(iconRadius, middleAngle);
            const fill = shadeFor(faction, type);
            rings.push(
                <g key={`${faction}|${type}`} {...segmentProps(faction, type, counts[faction][type])}>
                    <path
                        d={arcPath(OUTER.from, OUTER.to, typeAngle, typeAngle + typeSpan)}
                        fill={fill}
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                        className={SEGMENT_STROKE_CLASSES}
                    />
                    {iconArc >= MIN_ICON_ARC && (
                        <text
                            x={icon.x}
                            y={icon.y}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={Math.min(18, iconArc * 0.78)}
                            fill={thronesFontColors[faction]}
                            className="font-thronesdb pointer-events-none"
                        >
                            {thronesIcons[type]}
                        </text>
                    )}
                </g>
            );

            const isBelow = isBelowExpected(counts, faction, type, neutralWeight);
            const wasBelow = isBelowExpected(previous, faction, type, neutralWeight);
            const dotOpacity = isBelow && wasBelow ? 1 : isBelow ? progress : wasBelow ? 1 - progress : 0;
            if (dotOpacity > 0) {
                const dot = polar(DOT_RADIUS, middleAngle);
                dots.push(
                    <circle
                        key={`${faction}|${type}`}
                        cx={dot.x}
                        cy={dot.y}
                        r={3.5}
                        opacity={dotOpacity}
                        className="fill-warning pointer-events-none"
                    />
                );
            }
            typeAngle += typeSpan;
        }
        angle += span;
    }

    const focusCount = focus && (focus.type ? counts[focus.faction][focus.type] : factionTotal(counts, focus.faction));
    const focusExpected =
        focus?.type && focus.type !== "agenda"
            ? expectedCount(averages, focus.faction, focus.type, neutralWeight)
            : undefined;

    return (
        <div ref={containerRef} className="relative w-full">
            <svg
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                className="block w-full h-auto"
                role="img"
                aria-label="Suggestions by faction and card type"
            >
                {shownTotal <= 0.001 && (
                    <path
                        d={arcPath(INNER.from, OUTER.to, 0, Math.PI * 2 - 0.0001)}
                        className="fill-content2 stroke-content3"
                    />
                )}
                <g>{rings}</g>
                <g>{dots}</g>
                <g className="pointer-events-none">
                    {focus ? (
                        <>
                            <text
                                x={CENTRE}
                                y={CENTRE - 16}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={24}
                                className="font-thronesdb fill-foreground"
                            >
                                {thronesIcons[focus.faction]}
                                {focus.type && ` ${thronesIcons[focus.type]}`}
                            </text>
                            <text
                                x={CENTRE}
                                y={CENTRE + 16}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={24}
                                fontWeight={600}
                                className="fill-foreground tabular-nums"
                            >
                                {focusCount}
                            </text>
                        </>
                    ) : (
                        <>
                            <text
                                x={CENTRE}
                                y={CENTRE - 4}
                                textAnchor="middle"
                                fontSize={32}
                                fontWeight={600}
                                className="fill-foreground tabular-nums"
                            >
                                {hasSelection ? selectedTotal : Math.round(shownTotal)}
                            </text>
                            <text
                                x={CENTRE}
                                y={CENTRE + 18}
                                textAnchor="middle"
                                fontSize={10}
                                letterSpacing={1.5}
                                className="fill-foreground/50"
                            >
                                {hasSelection ? "SELECTED" : "SUGGESTIONS"}
                            </text>
                        </>
                    )}
                </g>
            </svg>
            {focus && focus.x !== undefined && focus.y !== undefined && (
                <div
                    className="absolute z-10 pointer-events-none min-w-40 rounded-md border border-content3 bg-content1 px-2.5 py-2 text-xs shadow-lg"
                    style={{
                        left: focus.x + (focus.flipX ? -14 : 14),
                        top: focus.y + (focus.flipY ? -14 : 14),
                        transform: `translate(${focus.flipX ? "-100%" : "0"}, ${focus.flipY ? "-100%" : "0"})`
                    }}
                >
                    <div className="flex items-center gap-1.5 font-cinzel text-sm text-foreground">
                        <ThronesIcon name={focus.faction} />
                        {factionNames[focus.faction]}
                    </div>
                    <div className="flex justify-between gap-3 text-foreground/70 tabular-nums">
                        <span className="flex items-center gap-1">
                            {focus.type ? (
                                <>
                                    <ThronesIcon name={focus.type} />
                                    {typeNames[focus.type]}
                                </>
                            ) : (
                                "All types"
                            )}
                        </span>
                        <span className="font-semibold text-foreground">{focusCount}</span>
                    </div>
                    {focusExpected !== undefined && (
                        <div className="flex justify-between gap-3 text-foreground/50 tabular-nums">
                            <span>Expected</span>
                            <span>{focusExpected}</span>
                        </div>
                    )}
                    {focusExpected !== undefined && focusCount !== undefined && focusCount < focusExpected && (
                        <div className="text-warning">Below expected for this type</div>
                    )}
                </div>
            )}
        </div>
    );
}

type SpreadSunburstProps = {
    counts: CountGrid;
    neutralWeight: number;
    selection: SpreadSelection;
    onSelectionChange: (selection: SpreadSelection) => void;
};
