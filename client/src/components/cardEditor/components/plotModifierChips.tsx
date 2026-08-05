import { Button } from "@heroui/react";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { PlotStat, plotStats } from "common/models/cards";
import { thronesColors, titleCase } from "common/utils";
import classNames from "classnames";
import { BaseElementProps } from "../../../types";
import { formatPlotModifier, PlotModifiers, stepPlotModifier } from "./plotModifiers";

export const PlotModifierChips = ({
    className,
    style,
    value: modifiers,
    setValue: setModifiers,
    isDisabled
}: Omit<BaseElementProps, "children"> & {
    value: PlotModifiers;
    setValue: (modifiers: PlotModifiers) => void;
    isDisabled?: boolean;
}) => {
    const active = plotStats.filter((stat) => modifiers[stat] !== undefined);

    if (active.length === 0) {
        return null;
    }

    return (
        <div className={classNames("flex flex-wrap items-center gap-1 px-2 pb-2", className)} style={style}>
            {active.map((stat) => (
                <PlotModifierChip
                    key={stat}
                    stat={stat}
                    value={modifiers[stat]!}
                    setValue={(value) => setModifiers({ ...modifiers, [stat]: value })}
                    isDisabled={isDisabled}
                />
            ))}
        </div>
    );
};

const PlotModifierChip = ({ stat, value, setValue, isDisabled }: PlotModifierChipProps) => {
    return (
        <div
            className={classNames("flex items-center gap-1 rounded-full py-0.5 px-1 text-black", {
                "opacity-50": isDisabled
            })}
            style={{ backgroundColor: thronesColors[stat] }}
        >
            <StepButton
                label={`Decrease ${titleCase(stat)} modifier`}
                icon={faMinus}
                onStep={() => setValue(stepPlotModifier(value, -1))}
                isDisabled={isDisabled}
            />
            <span className="text-[0.625rem] leading-none font-semibold uppercase tracking-wider opacity-70">
                {titleCase(stat)}
            </span>
            <span className="text-medium leading-none font-bold tabular-nums">{formatPlotModifier(value)}</span>
            <StepButton
                label={`Increase ${titleCase(stat)} modifier`}
                icon={faPlus}
                onStep={() => setValue(stepPlotModifier(value, 1))}
                isDisabled={isDisabled}
            />
        </div>
    );
};

type PlotModifierChipProps = {
    stat: PlotStat;
    value: number;
    setValue: (value: number) => void;
    isDisabled?: boolean;
};

const StepButton = ({ label, icon, onStep, isDisabled }: StepButtonProps) => {
    return (
        <Button
            className="size-5 min-w-5 text-black/70 data-[hover=true]:bg-black/10 transition-transform data-[pressed=true]:scale-90"
            aria-label={label}
            onPress={onStep}
            isIconOnly={true}
            radius="full"
            size="sm"
            variant="light"
            isDisabled={isDisabled}
        >
            <FontAwesomeIcon icon={icon} size="xs" />
        </Button>
    );
};

type StepButtonProps = {
    label: string;
    icon: IconDefinition;
    onStep: () => void;
    isDisabled?: boolean;
};
