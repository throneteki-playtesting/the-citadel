import TimeAgo, { Formatter } from "react-timeago";
import { CSSProperties } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencilSquare } from "@fortawesome/free-solid-svg-icons";

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

export default function Timestamp({ date, isEdited, className, style }: TimestampProps) {
    return (
        <span
            style={style}
            className={className}
        >
            {isEdited && (
                <FontAwesomeIcon icon={faPencilSquare}/>
            )}
            <TimeAgo date={date} formatter={shortFormatter} />
        </span>
    );
}
type TimestampProps = {
  date: Date;
  isEdited?: boolean;
  className?: string;
  style?: CSSProperties;
};