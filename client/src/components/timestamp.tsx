import TimeAgo, { Formatter } from "react-timeago";
import { CSSProperties } from "react";
import { TouchTooltip } from "./touchTooltip";
import classNames from "classnames";
import { ISO8601String } from "common/types";
import useTimezone from "../hooks/useTimezone";

const shortFormatter: Formatter = (value, unit) => {
    if (unit === "second") return value < 10 ? "just now" : `${value}s`;
    if (unit === "minute") return `${value}m`;
    if (unit === "hour") return `${value}h`;
    if (unit === "day") return `${value}d`;
    if (unit === "week") return `${value}w`;
    if (unit === "month") return `${value}mo`;
    if (unit === "year") return `${value}y`;
    return `${value} ${unit}`;
};

export default function Timestamp({ date, className, style }: TimestampProps) {
    const { format } = useTimezone();
    return (
        <TouchTooltip content={format(new Date(date))}>
            <div
                style={style}
                className={classNames("space-x-0.5 font-sans", className)}
            >
                <TimeAgo date={date} formatter={shortFormatter} />
            </div>
        </TouchTooltip>
    );
}
type TimestampProps = {
  date: Date | ISO8601String;
  className?: string;
  style?: CSSProperties;
};