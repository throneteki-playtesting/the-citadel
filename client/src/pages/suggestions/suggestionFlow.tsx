import classNames from "classnames";
import { SUGGESTION_APPROVAL_VOTE_THRESHOLD } from "common/designGuidelines/suggestionApproval";
import { useSvgId } from "../../hooks/useSvgId";

const WIDTH = 460;
const HEIGHT = 196;
const TOP = 34;
// The height a stage would take holding every submission - each band is its share of this
const FULL = 104;
const NODE_WIDTH = 8;
const NODE_X = [0, 196, 392];
// Breathing room between the band running straight to approval and the threshold stage it passes over
const BYPASS_GAP = 6;
// How far a drop-off curves down, and how far it travels before it has faded out
const DROP_DIP = 34;
const DROP_LENGTH = 110;
// Below this a band is too thin to carry its own percentage
const MIN_LABELLED_BAND = 14;

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

// A band from one node's slice to another's, easing between the two heights
function ribbon(x0: number, from: [number, number], x1: number, to: [number, number]) {
    const mid = (x0 + x1) / 2;
    return (
        `M${x0},${from[0]} C${mid},${from[0]} ${mid},${to[0]} ${x1},${to[0]} ` +
        `L${x1},${to[1]} C${mid},${to[1]} ${mid},${from[1]} ${x0},${from[1]} Z`
    );
}

// What didn't carry on, curving down and fading out
function dropOff(x0: number, from: [number, number]) {
    const end = x0 + DROP_LENGTH;
    const [y0, y1] = from;
    return (
        `M${x0},${y0} C${x0 + 50},${y0} ${x0 + 60},${y0 + DROP_DIP} ${end},${y0 + DROP_DIP} ` +
        `L${end},${y1 + DROP_DIP} C${x0 + 60},${y1 + DROP_DIP} ${x0 + 50},${y1} ${x0},${y1} Z`
    );
}

/** How far suggestions get: submitted, reached the like threshold, approved - with a band straight to approval
 *  over the threshold, since it isn't needed. Whatever goes no further peels off downwards with its count. */
export default function SuggestionFlow({
    submitted,
    reached,
    approvedAfterReaching,
    approvedDirectly
}: SuggestionFlowProps) {
    const fadeId = useSvgId("flow");
    // Anything non-zero keeps a sliver, so a route never vanishes just for being small
    const heightOf = (value: number) => (submitted ? Math.max(value ? 3 : 0, (value / submitted) * FULL) : 0);
    const approved = approvedAfterReaching + approvedDirectly;
    const neverReached = submitted - reached - approvedDirectly;
    const awaiting = reached - approvedAfterReaching;

    const direct = heightOf(approvedDirectly);
    const reach = heightOf(reached);
    const after = heightOf(approvedAfterReaching);
    const gap = approvedDirectly > 0 ? BYPASS_GAP : 0;

    // Each node's top: the threshold stage sits below the direct band, so that band passes clear over it
    const nodeTop = [TOP, TOP + direct + gap, TOP];
    const nodeHeight = [heightOf(submitted), reach, direct + after];
    const leave = (index: number) => NODE_X[index] + NODE_WIDTH;

    const bands = [
        {
            key: "direct",
            show: approvedDirectly > 0,
            d: ribbon(leave(0), [TOP, TOP + direct], NODE_X[2], [TOP, TOP + direct]),
            className: "fill-primary",
            title: `${approvedDirectly} approved before reaching ${SUGGESTION_APPROVAL_VOTE_THRESHOLD} likes`,
            label: direct >= MIN_LABELLED_BAND ? `${percent(approvedDirectly, submitted)}%` : undefined,
            labelAt: { x: (leave(0) + NODE_X[2]) / 2, y: TOP + direct / 2 }
        },
        {
            key: "reach",
            show: reached > 0,
            d: ribbon(leave(0), [TOP + direct, TOP + direct + reach], NODE_X[1], [nodeTop[1], nodeTop[1] + reach]),
            className: "fill-primary-200",
            title: `${reached} reached ${SUGGESTION_APPROVAL_VOTE_THRESHOLD} likes`,
            label: reach >= MIN_LABELLED_BAND ? `${percent(reached, submitted)}%` : undefined,
            labelAt: { x: (leave(0) + NODE_X[1]) / 2, y: (TOP + direct + nodeTop[1]) / 2 + reach / 2 }
        },
        {
            key: "after",
            show: approvedAfterReaching > 0,
            d: ribbon(leave(1), [nodeTop[1], nodeTop[1] + after], NODE_X[2], [TOP + direct, TOP + direct + after]),
            className: "fill-primary",
            title: `${approvedAfterReaching} approved after reaching ${SUGGESTION_APPROVAL_VOTE_THRESHOLD} likes`,
            label: after >= MIN_LABELLED_BAND ? `${percent(approvedAfterReaching, reached)}%` : undefined,
            labelAt: { x: (leave(1) + NODE_X[2]) / 2, y: (nodeTop[1] + TOP + direct) / 2 + after / 2 }
        }
    ];

    const drops = [
        {
            key: "never",
            count: neverReached,
            from: [TOP + direct + reach, TOP + nodeHeight[0]] as [number, number],
            x: leave(0),
            label: `${neverReached} under ${SUGGESTION_APPROVAL_VOTE_THRESHOLD} likes`
        },
        {
            key: "awaiting",
            count: awaiting,
            from: [nodeTop[1] + after, nodeTop[1] + reach] as [number, number],
            x: leave(1),
            label: `${awaiting} awaiting a decision`
        }
    ];

    const stages = [
        { label: "Submitted", value: submitted, node: "fill-content4" },
        { label: `Reached ${SUGGESTION_APPROVAL_VOTE_THRESHOLD} likes`, value: reached, node: "fill-primary-200" },
        { label: "Approved", value: approved, node: "fill-primary" }
    ];

    return (
        <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="block w-full h-auto overflow-visible text-foreground"
            role="img"
            aria-label={
                `${submitted} submitted, ${reached} reached ${SUGGESTION_APPROVAL_VOTE_THRESHOLD} likes, ` +
                `${approved} approved (${approvedDirectly} before reaching it)`
            }
        >
            <defs>
                <linearGradient id={fadeId} x1={0} y1={0} x2={1} y2={0}>
                    <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                </linearGradient>
            </defs>
            {drops.map(
                (drop, index) =>
                    drop.count > 0 &&
                    drop.from[1] - drop.from[0] > 0.5 && (
                        <g key={drop.key}>
                            <path d={dropOff(drop.x, drop.from)} fill={`url(#${fadeId})`} />
                            <text
                                x={index === 0 ? drop.x + DROP_LENGTH + 6 : WIDTH}
                                y={Math.min(HEIGHT - 6, (drop.from[0] + drop.from[1]) / 2 + DROP_DIP + 4)}
                                textAnchor={index === 0 ? "start" : "end"}
                                fontSize={11}
                                className="fill-foreground/50"
                            >
                                {drop.label}
                            </text>
                        </g>
                    )
            )}
            {bands.map(
                (band) =>
                    band.show && (
                        <g key={band.key}>
                            <path d={band.d} fillOpacity={0.32} className={band.className}>
                                <title>{band.title}</title>
                            </path>
                            {band.label && (
                                <text
                                    x={band.labelAt.x}
                                    y={band.labelAt.y + 4}
                                    textAnchor="middle"
                                    fontSize={11}
                                    fontWeight={600}
                                    className="fill-foreground pointer-events-none"
                                >
                                    {band.label}
                                </text>
                            )}
                        </g>
                    )
            )}
            {stages.map((stage, index) => {
                const isLast = index === stages.length - 1;
                const x = isLast ? leave(index) : NODE_X[index];
                const anchor = isLast ? "end" : "start";
                return (
                    <g key={stage.label}>
                        <rect
                            x={NODE_X[index]}
                            y={nodeTop[index]}
                            width={NODE_WIDTH}
                            height={nodeHeight[index]}
                            rx={2}
                            className={stage.node}
                        />
                        <text
                            x={x}
                            y={14}
                            textAnchor={anchor}
                            fontSize={15}
                            fontWeight={600}
                            className={classNames("tabular-nums", isLast ? "fill-primary" : "fill-foreground")}
                        >
                            {stage.value}
                        </text>
                        <text x={x} y={27} textAnchor={anchor} fontSize={11} className="fill-foreground/50">
                            {stage.label}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

type SuggestionFlowProps = {
    submitted: number;
    reached: number;
    approvedAfterReaching: number;
    approvedDirectly: number;
};
