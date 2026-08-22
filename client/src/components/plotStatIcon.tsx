import classNames from "classnames";
import { PlotStat } from "common/models/cards";
import { plotStatClipPaths } from "common/utils";
import { CSSProperties } from "react";

const isRound = (name: PlotStat) => name === "income";

const PlotStatIcon = ({ name, className, style }: PlotStatIconProps) => {
    return (
        <span
            className={classNames(
                "inline-block shrink-0 size-3.5 bg-current",
                { "rounded-full": isRound(name) },
                className
            )}
            style={{ clipPath: isRound(name) ? undefined : plotStatClipPaths[name], ...style }}
        />
    );
};

type PlotStatIconProps = {
    name: PlotStat;
    className?: string;
    style?: CSSProperties;
};

export default PlotStatIcon;
