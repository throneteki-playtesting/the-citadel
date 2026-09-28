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

// Reads as part of a sentence ("Started 3 hours ago") - every unit the short form has, spelled out, with the
// suffix react-timeago supplies so a future date reads "in 2 days" rather than "2 days ago"
const longFormatter: Formatter = (value, unit, suffix) => {
    if (unit === "second" && value < 10) {
        return "just now";
    }
    const amount = `${value} ${unit}${value === 1 ? "" : "s"}`;
    return suffix === "from now" ? `in ${amount}` : `${amount} ${suffix}`;
};

export default function Timestamp({ date, variant = "short", inline = false, className, style }: TimestampProps) {
    const { format } = useTimezone();
    const Element = inline ? "span" : "div";
    return (
        <TouchTooltip content={format(new Date(date))}>
            <Element
                style={style}
                className={classNames("space-x-0.5 font-sans", { "inline-block": inline }, className)}
            >
                <TimeAgo date={date} formatter={variant === "long" ? longFormatter : shortFormatter} />
            </Element>
        </TouchTooltip>
    );
}
type TimestampProps = {
    date: Date | ISO8601String;
    /** "short" is "3h", "long" is "3 hours ago" - for when it sits inside a sentence */
    variant?: "short" | "long";
    /** Flows with the text around it, rather than taking a line of its own */
    inline?: boolean;
    className?: string;
    style?: CSSProperties;
};
