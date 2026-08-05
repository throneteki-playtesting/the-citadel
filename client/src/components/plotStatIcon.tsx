import classNames from "classnames";
import { PlotStat } from "common/models/cards";
import { plotStatClipPaths } from "common/utils";
import { CSSProperties } from "react";

const PlotStatIcon = ({ name, className, style }: PlotStatIconProps) => {
    return (
        <span
            className={classNames("inline-block size-3.5 bg-current", className)}
            style={{ clipPath: plotStatClipPaths[name], ...style }}
        />
    );
};

type PlotStatIconProps = {
    name: PlotStat;
    className?: string;
    style?: CSSProperties;
};

export default PlotStatIcon;
