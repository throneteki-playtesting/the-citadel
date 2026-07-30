import classNames from "classnames";
import { ChallengeIcon, Faction, Type } from "common/models/cards";
import { thronesIcons } from "common/utils";
import { CSSProperties } from "react";

const ThronesIcon = ({ name, className, style, visible = true }: IconProps) => {
    return (
        <span
            className={classNames(
                "font-thronesdb leading-none",
                { invisible: !visible, "leading-relaxed": name === "unique" },
                className
            )}
            style={style}
        >
            {thronesIcons[name]}
        </span>
    );
};

export type Icon = Faction | ChallengeIcon | "unique" | Type;

type IconProps = {
    name: Icon;
    className?: string;
    style?: CSSProperties;
    visible?: boolean;
};

export default ThronesIcon;
