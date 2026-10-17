import { KeyboardEvent, MouseEvent, ReactElement, ReactNode, useEffect, useRef, useState } from "react";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { Faction, factions, Type, types } from "common/models/cards";
import { factionNames, thronesColors, thronesFontColors, thronesIcons, typeNames } from "common/utils";
import { CountGrid, emptyGrid, Expectations, expectations, SpreadCounts } from "./spreadCounts";
import {
    isCellSelected,
    isFactionPartlySelected,
    isFactionSelected,
    SpreadSelection,
    toggleSelection
} from "./spreadSelection";
import { EASE_STANDARD } from "../../constants";
import { useTween } from "../../hooks/useTween";
import { useLongPress } from "../../hooks/useLongPress";

const SIZE = 480;
const CENTRE = SIZE / 2;
const INNER = { from: 76, to: 152 };
const OUTER = { from: 155, to: 228 };
const MARKER_RADIUS = 235;
// Room past the chart's own edge, so a marker sitting beyond the outer ring isn't clipped
const VIEW_PADDING = 1;
// The shortest arc (px, at the ring's midline) an icon is drawn in - anything smaller is left to the centre readout
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

const LONG_PRESS_MS = 450;

const READOUT_FADE = { duration: 0.15 } as const;

const OUTLINE_CLASSES =
    "stroke-transparent group-hover:stroke-foreground group-focus-visible:stroke-primary group-focus-visible:[stroke-width:3]";

// A dot is the unique share falling short and a ring the non-unique one - a type without the split is both at once
function markersFor({ total, unique, nonUnique }: Expectations) {
    return unique && nonUnique
        ? { dot: unique.isBelow, ring: nonUnique.isBelow }
        : { dot: !!total?.isBelow, ring: !!total?.isBelow };
}

function fadeOpacity(isShown: boolean, wasShown: boolean, progress: number) {
    return isShown && wasShown ? 1 : isShown ? progress : wasShown ? 1 - progress : 0;
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

const lerpCounts = (from: SpreadCounts, to: SpreadCounts, progress: number): SpreadCounts => ({
    total: lerpGrid(from.total, to.total, progress),
    unique: lerpGrid(from.unique, to.unique, progress),
    nonUnique: lerpGrid(from.nonUnique, to.nonUnique, progress)
});

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

type Focus = { faction: Faction; type?: Type };

type Segment = Focus & { count: number; d: string; fill: string; icon: ReactNode };

/** Faction on the inner ring, card type on the outer, sized by count, with markers for a segment below what's
 *  expected (see expectations). Clicking picks segments - Ctrl/Cmd adds to or removes from what's picked. */
export default function SpreadSunburst({ counts, neutralWeight, selection, onSelectionChange }: SpreadSunburstProps) {
    const { shown: shownCounts, previous, progress } = useTween(counts, { lerp: lerpCounts, transition: TWEEN });
    const shown = shownCounts.total;
    const totals = counts.total;
    const [focus, setFocus] = useState<Focus>();
    const svgRef = useRef<SVGSVGElement>(null);
    const longPress = useLongPress(LONG_PRESS_MS);
    // Entered by a long-press, the phone's Ctrl/Cmd - every tap then adds or removes until the selection empties
    const [isMultiSelecting, setIsMultiSelecting] = useState(false);
    if (isMultiSelecting && selection.size === 0) {
        setIsMultiSelecting(false);
    }

    const shownTotal = factions.reduce((sum, faction) => sum + factionTotal(shown, faction), 0);

    // A touch never leaves a segment the way a mouse does, so a tap anywhere off the chart lets the readout go
    useEffect(() => {
        if (!focus) {
            return;
        }
        const onPointerDown = (e: globalThis.PointerEvent) => {
            if (e.pointerType === "touch" && !svgRef.current?.contains(e.target as Node)) {
                setFocus(undefined);
            }
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [focus]);

    const hasSelection = selection.size > 0;
    const selectedTotal = factions.reduce(
        (sum, faction) =>
            sum +
            types.reduce(
                (total, type) => total + (isCellSelected(selection, faction, type) ? totals[faction][type] : 0),
                0
            ),
        0
    );

    const isSegmentSelected = (faction: Faction, type?: Type) =>
        type ? isCellSelected(selection, faction, type) : isFactionSelected(selection, faction);

    // A faction with only some of its types picked stays half-lit, so it still reads as involved
    const dimClasses = (faction: Faction, type?: Type) =>
        hasSelection &&
        !isSegmentSelected(faction, type) &&
        (!type && isFactionPartlySelected(selection, faction) ? "opacity-60" : "opacity-25");

    const segmentProps = (faction: Faction, type: Type | undefined, count: number) => {
        const visibleTypes = types.filter((t) => totals[faction][t] > 0);
        const select = (additive: boolean) =>
            onSelectionChange(toggleSelection(selection, faction, type, additive, visibleTypes));
        const label = `${factionNames[faction]}${type ? ` ${typeNames[type]}` : ""}: ${count}`;
        return {
            role: "button",
            tabIndex: 0,
            "aria-label": label,
            "aria-pressed": isSegmentSelected(faction, type),
            className: "group cursor-pointer outline-none",
            onMouseEnter: () => setFocus({ faction, type }),
            onMouseLeave: () => setFocus(undefined),
            onFocus: () => setFocus({ faction, type }),
            onBlur: () => setFocus(undefined),
            ...longPress.bind(() => {
                setIsMultiSelecting(true);
                setFocus({ faction, type });
                select(true);
            }),
            onClick: (e: MouseEvent) => {
                if (longPress.consumeLongPress()) {
                    return;
                }
                setFocus({ faction, type });
                select(e.ctrlKey || e.metaKey || isMultiSelecting);
            },
            onKeyDown: (e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(e.ctrlKey || e.metaKey);
                }
            }
        };
    };

    const rings: ReactElement[] = [];
    const outlines: ReactElement[] = [];
    const markers: ReactElement[] = [];
    // Outlines sit in a layer above every fill - drawn alongside their own, the next segment's fill covers one edge
    const pushSegment = (segment: Segment) => {
        const { faction, type, count, d, fill, icon } = segment;
        const key = `${faction}|${type ?? ""}`;
        rings.push(
            <g
                key={key}
                className={classNames("pointer-events-none transition-opacity duration-200", dimClasses(faction, type))}
            >
                <path d={d} fill={fill} strokeWidth={1.5} strokeLinejoin="round" className="stroke-default-400" />
                {icon}
            </g>
        );
        outlines.push(
            <g key={key} {...segmentProps(faction, type, count)}>
                <path d={d} fill="transparent" strokeWidth={1.5} strokeLinejoin="round" className={OUTLINE_CLASSES} />
            </g>
        );
    };
    let angle = -Math.PI / 2;
    for (const faction of factions) {
        const total = factionTotal(shown, faction);
        if (total <= 0.001) {
            continue;
        }
        const span = (total / shownTotal) * Math.PI * 2;
        const middle = polar((INNER.from + INNER.to) / 2, angle + span / 2);
        const room = span * ((INNER.from + INNER.to) / 2);
        pushSegment({
            faction,
            count: factionTotal(totals, faction),
            d: arcPath(INNER.from, INNER.to, angle, angle + span),
            fill: thronesColors[faction],
            icon: room >= MIN_ICON_ARC && (
                <text
                    x={middle.x}
                    y={middle.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={Math.max(14, Math.min(30, room * 0.62))}
                    fill={thronesFontColors[faction]}
                    className="font-thronesdb"
                >
                    {thronesIcons[faction]}
                </text>
            )
        });

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
            pushSegment({
                faction,
                type,
                count: totals[faction][type],
                d: arcPath(OUTER.from, OUTER.to, typeAngle, typeAngle + typeSpan),
                fill: shadeFor(faction, type),
                icon: iconArc >= MIN_ICON_ARC && (
                    <text
                        x={icon.x}
                        y={icon.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={Math.min(18, iconArc * 0.78)}
                        fill={thronesFontColors[faction]}
                        className="font-thronesdb"
                    >
                        {thronesIcons[type]}
                    </text>
                )
            });

            const now = markersFor(expectations(counts, faction, type, neutralWeight));
            const was = markersFor(expectations(previous, faction, type, neutralWeight));
            const dotOpacity = fadeOpacity(now.dot, was.dot, progress);
            const ringOpacity = fadeOpacity(now.ring, was.ring, progress);
            if (dotOpacity > 0 || ringOpacity > 0) {
                const marker = polar(MARKER_RADIUS, middleAngle);
                markers.push(
                    <g key={`${faction}|${type}`} className="pointer-events-none">
                        <SpreadMarker x={marker.x} y={marker.y} dotOpacity={dotOpacity} ringOpacity={ringOpacity} />
                    </g>
                );
            }
            typeAngle += typeSpan;
        }
        angle += span;
    }

    const focusCount = focus && (focus.type ? totals[focus.faction][focus.type] : factionTotal(totals, focus.faction));
    const focusExpectations = focus?.type ? expectations(counts, focus.faction, focus.type, neutralWeight) : {};
    const hint = isMultiSelecting ? "Tap to add or remove - Clear to finish" : "Hold a segment to select several";

    return (
        <div className="w-full flex flex-col gap-1">
            <svg
                ref={svgRef}
                viewBox={`${-VIEW_PADDING} ${-VIEW_PADDING} ${SIZE + VIEW_PADDING * 2} ${SIZE + VIEW_PADDING * 2}`}
                className="block w-full h-auto select-none [-webkit-touch-callout:none]"
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
                <g>{outlines}</g>
                <g>{markers}</g>
                <AnimatePresence initial={false}>
                    <motion.g
                        key={focus ? `${focus.faction}|${focus.type ?? ""}` : `summary|${hasSelection}`}
                        className="pointer-events-none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={READOUT_FADE}
                    >
                        {focus ? (
                            <>
                                <text
                                    x={CENTRE}
                                    y={CENTRE - 30}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fontSize={22}
                                    className="font-thronesdb fill-foreground"
                                >
                                    {thronesIcons[focus.faction]}
                                    {focus.type && ` ${thronesIcons[focus.type]}`}
                                </text>
                                <text
                                    x={CENTRE}
                                    y={CENTRE + 2}
                                    textAnchor="middle"
                                    dominantBaseline="central"
                                    fontSize={28}
                                    fontWeight={600}
                                    className={classNames(
                                        "tabular-nums",
                                        focusExpectations.total?.isBelow ? "fill-warning" : "fill-foreground"
                                    )}
                                >
                                    {focusCount}
                                </text>
                                {focusExpectations.unique && focusExpectations.nonUnique ? (
                                    <>
                                        <ReadoutLabel y={CENTRE + 26} isShort={focusExpectations.nonUnique.isBelow}>
                                            {focusExpectations.nonUnique.count} NON-UNIQUE
                                        </ReadoutLabel>
                                        <ReadoutLabel y={CENTRE + 40} isShort={focusExpectations.unique.isBelow}>
                                            {focusExpectations.unique.count} UNIQUE
                                        </ReadoutLabel>
                                    </>
                                ) : (
                                    <ReadoutLabel y={CENTRE + 26}>
                                        {(focus.type
                                            ? typeNames[focus.type]
                                            : factionNames[focus.faction]
                                        ).toUpperCase()}
                                    </ReadoutLabel>
                                )}
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
                                <ReadoutLabel y={CENTRE + 18}>{hasSelection ? "SELECTED" : "SUGGESTIONS"}</ReadoutLabel>
                            </>
                        )}
                    </motion.g>
                </AnimatePresence>
            </svg>
            <div className="hidden pointer-coarse:block text-xs text-foreground/40">{hint}</div>
        </div>
    );
}

function ReadoutLabel({ y, isShort, children }: { y: number; isShort?: boolean; children: ReactNode }) {
    return (
        <text
            x={CENTRE}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            letterSpacing={1.5}
            className={isShort ? "fill-warning" : "fill-foreground/50"}
        >
            {children}
        </text>
    );
}

/** The below-expected marker, drawn around `x`/`y` - shared with the legend so the two can't drift apart */
export function SpreadMarker({ x = 0, y = 0, dotOpacity = 1, ringOpacity = 1 }: SpreadMarkerProps) {
    return (
        <>
            {dotOpacity > 0 && <circle cx={x} cy={y} r={3} opacity={dotOpacity} className="fill-warning" />}
            {ringOpacity > 0 && (
                <circle
                    cx={x}
                    cy={y}
                    r={5}
                    fill="none"
                    strokeWidth={1.25}
                    opacity={ringOpacity}
                    className="stroke-warning"
                />
            )}
        </>
    );
}

type SpreadMarkerProps = { x?: number; y?: number; dotOpacity?: number; ringOpacity?: number };

type SpreadSunburstProps = {
    counts: SpreadCounts;
    neutralWeight: number;
    selection: SpreadSelection;
    onSelectionChange: (selection: SpreadSelection) => void;
};
