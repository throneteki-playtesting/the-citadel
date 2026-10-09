import { ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClipboardCheck, faCoins, faNoteSticky, faStar } from "@fortawesome/free-solid-svg-icons";
import { ChallengeIcon, challengeIcons } from "common/models/cards";
import { describeCondition, describeIcon, formatRange, SlotCondition } from "common/models/slotConditions";
import { ISlotOptions } from "common/models/slots";
import { useContainerWidth } from "../../hooks/useContainerWidth";
import { TouchTooltip } from "../touchTooltip";
import ThronesIcon from "../thronesIcon";
import PlotStatIcon from "../plotStatIcon";
import RichText from "../richText";

// Matches the strip's gap-2, so the measured row adds up to what is drawn
const TOKEN_GAP = 8;

// A slot's options along its strip - as many conditions as fit, then "+N more" for the rest
export default function SlotOptionsSummary({ className, options }: SlotOptionsSummaryProps) {
    const conditions = options.conditions ?? [];
    const { ref: availableRef, width: available } = useContainerWidth<HTMLSpanElement>();
    const { ref: observeMeasure, width: needed } = useContainerWidth<HTMLSpanElement>();
    const measureElement = useRef<HTMLSpanElement | null>(null);
    const measureRef = useCallback(
        (element: HTMLSpanElement | null) => {
            measureElement.current = element;
            observeMeasure(element);
        },
        [observeMeasure]
    );
    const [shownCount, setShownCount] = useState(conditions.length);

    // As many conditions as fit, in order, always leaving room for "+N more" and the extras after them
    useLayoutEffect(() => {
        const element = measureElement.current;
        if (!element) {
            return;
        }
        const widthsOf = (selector: string) =>
            [...element.querySelectorAll<HTMLElement>(selector)].map((node) => node.offsetWidth);
        const rowWidth = (widths: number[]) =>
            widths.reduce((sum, width) => sum + width, 0) + TOKEN_GAP * Math.max(0, widths.length - 1);
        const tokens = widthsOf("[data-token]");
        const [more = 0] = widthsOf("[data-more]");
        const extras = widthsOf("[data-extra]");

        let count = tokens.length;
        if (rowWidth([...tokens, ...extras]) > available) {
            do {
                count--;
            } while (count > 0 && rowWidth([...tokens.slice(0, count), more, ...extras]) > available);
        }
        setShownCount(count);
    }, [available, needed, conditions.length]);

    if (conditions.length === 0 && !options.important && !options.notes) {
        return null;
    }

    const tokens = conditions.map((condition) => (
        <span key={condition.stat} data-token className="inline-flex shrink-0 items-center gap-1">
            {conditionToken(condition)}
        </span>
    ));
    const hiddenCount = conditions.length - shownCount;

    return (
        <span ref={availableRef} className={classNames("relative flex min-w-0 flex-1", className)}>
            <span ref={measureRef} aria-hidden className="invisible absolute flex items-center gap-2 whitespace-nowrap">
                {tokens}
                <span data-more>+{conditions.length} more</span>
                {options.important && (
                    <span data-extra className="inline-flex shrink-0">
                        <FontAwesomeIcon icon={faStar} />
                    </span>
                )}
                {options.notes && (
                    <span data-extra className="inline-flex shrink-0">
                        <FontAwesomeIcon icon={faNoteSticky} />
                    </span>
                )}
            </span>
            <span className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
                {conditions.length > 0 && (
                    <TouchTooltip
                        content={
                            <div className="flex flex-col gap-1 py-1 max-w-64 text-xs">
                                <span className="font-cinzel text-sm">Slot needs:</span>
                                {conditions.flatMap(tooltipLines).map(({ key, token, text }) => (
                                    <span key={key} className="flex items-center gap-2">
                                        <span className="inline-flex w-5 shrink-0 justify-center">{token}</span>
                                        {text}
                                    </span>
                                ))}
                            </div>
                        }
                    >
                        <span className="flex min-w-0 items-center gap-2 overflow-hidden cursor-help">
                            {tokens.slice(0, shownCount)}
                            {hiddenCount > 0 && (
                                <span className="inline-flex shrink-0 items-center gap-1 text-foreground/50">
                                    {shownCount === 0 ? (
                                        <>
                                            {hiddenCount}
                                            <FontAwesomeIcon icon={faClipboardCheck} />
                                        </>
                                    ) : (
                                        `+${hiddenCount} more`
                                    )}
                                </span>
                            )}
                        </span>
                    </TouchTooltip>
                )}
                {options.important && (
                    <TouchTooltip
                        content={
                            <div className="max-w-64 py-1 text-xs">
                                <span className="font-cinzel text-sm">Important addition</span>
                                <div>The project must deliver this card.</div>
                            </div>
                        }
                    >
                        <span className="inline-flex shrink-0 cursor-help">
                            <FontAwesomeIcon icon={faStar} />
                        </span>
                    </TouchTooltip>
                )}
                {options.notes && (
                    <TouchTooltip
                        content={
                            <div className="max-w-64 py-1 text-xs">
                                <span className="font-cinzel text-sm">Notes</span>
                                <RichText html={options.notes} />
                            </div>
                        }
                    >
                        <span className="inline-flex shrink-0 cursor-help">
                            <FontAwesomeIcon icon={faNoteSticky} />
                        </span>
                    </TouchTooltip>
                )}
            </span>
        </span>
    );
}

// Every condition written out in full, for where there is room to - the icon and what it asks, run together
export function SlotNeeds({ className, conditions }: { className?: string; conditions: SlotCondition[] }) {
    const lines = conditions.flatMap(tooltipLines);
    return (
        <p className={classNames("text-sm text-foreground/60", className)}>
            <span className="font-cinzel text-foreground/80">Slot needs: </span>
            {lines.map(({ key, token, text }, index) => (
                <span key={key}>
                    <span className="inline-flex items-center gap-1.5">
                        {token}
                        {text}
                    </span>
                    {index < lines.length - 1 && ", "}
                </span>
            ))}
        </p>
    );
}

// The tooltip's lines - one per condition, except icons, which take a line each
function tooltipLines(condition: SlotCondition): TooltipLine[] {
    if (condition.stat !== "icons") {
        return [{ key: condition.stat, token: conditionIcon(condition), text: describeCondition(condition) }];
    }
    return challengeIcons.flatMap((icon) => {
        const required = condition.icons[icon];
        return required === undefined
            ? []
            : [
                  {
                      key: icon,
                      token: iconToken(icon, required),
                      text: describeIcon(icon, required)
                  }
              ];
    });
}

// Just the icon, for a line whose text already carries the numbers - nothing for a condition with no icon
function conditionIcon(condition: SlotCondition): ReactNode {
    switch (condition.stat) {
        case "type":
        case "unique":
            return conditionToken(condition);
        case "cost":
            return <FontAwesomeIcon icon={faCoins} />;
        case "income":
        case "initiative":
        case "claim":
        case "reserve":
            return <PlotStatIcon name={condition.stat} className="size-3" />;
        default:
            return null;
    }
}

function conditionToken(condition: SlotCondition): ReactNode {
    switch (condition.stat) {
        case "type":
            return condition.types.map((type) => <ThronesIcon key={type} name={type} />);
        case "unique":
            return condition.value ? (
                <ThronesIcon name="unique" />
            ) : (
                <StruckOut>
                    <ThronesIcon name="unique" />
                </StruckOut>
            );
        case "loyal":
            return condition.value ? "Loyal" : "Non-loyal";
        case "icons":
            return challengeIcons.map((icon) => {
                const required = condition.icons[icon];
                return required === undefined ? null : <span key={icon}>{iconToken(icon, required)}</span>;
            });
        case "traits":
            return <span className="font-semibold italic">{condition.traits.join(" / ")}</span>;
        case "keywords":
            return condition.keywords.join(" / ");
        case "cost":
            return (
                <>
                    <FontAwesomeIcon icon={faCoins} />
                    {formatRange(condition)}
                </>
            );
        case "strength":
            return `STR ${formatRange(condition)}`;
        case "deckLimit":
            return `Limit ${formatRange(condition)}`;
        default:
            return (
                <>
                    <PlotStatIcon name={condition.stat} className="size-3" />
                    {formatRange(condition)}
                </>
            );
    }
}

function iconToken(icon: ChallengeIcon, required: boolean) {
    return required ? (
        <ThronesIcon name={icon} />
    ) : (
        <StruckOut>
            <ThronesIcon name={icon} />
        </StruckOut>
    );
}

// Struck through on the diagonal - the condition asks for the card not to have this
function StruckOut({ children }: { children: ReactNode }) {
    return (
        <span className="relative inline-flex items-center opacity-70">
            {children}
            <span
                className={classNames(
                    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-45",
                    "h-[1.5px] w-[140%] rounded-full bg-danger"
                )}
            />
        </span>
    );
}

type TooltipLine = { key: string; token: ReactNode; text: string };

type SlotOptionsSummaryProps = {
    className?: string;
    options: ISlotOptions;
};
