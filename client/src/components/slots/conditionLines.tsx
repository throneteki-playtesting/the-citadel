import { ReactNode } from "react";
import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCoins } from "@fortawesome/free-solid-svg-icons";
import { ChallengeIcon, challengeIcons } from "common/models/cards";
import { describeCondition, describeIcon, formatRange, SlotCondition } from "common/models/slotConditions";
import ThronesIcon from "../thronesIcon";
import PlotStatIcon from "../plotStatIcon";

// A condition as lines of icon and words - one per condition, except icons, which take a line each
export function conditionLines(condition: SlotCondition): ConditionLine[] {
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

export function conditionToken(condition: SlotCondition): ReactNode {
    switch (condition.stat) {
        case "type":
            return condition.types.map((type) => <ThronesIcon key={type} name={type} />);
        case "unique":
            return condition.value ? <ThronesIcon name="unique" /> : struckOut(<ThronesIcon name="unique" />);
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
    return required ? <ThronesIcon name={icon} /> : struckOut(<ThronesIcon name={icon} />);
}

// Struck through on the diagonal - the condition asks for the card not to have this
function struckOut(children: ReactNode) {
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

export type ConditionLine = { key: string; token: ReactNode; text: string };
