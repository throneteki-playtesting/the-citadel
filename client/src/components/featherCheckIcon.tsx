import { faCheck, faFeather } from "@fortawesome/free-solid-svg-icons";
import CornerBadgedIcon from "./cornerBadgedIcon";

// The feather with a check beside it - what is drafted, and already set aside
export default function FeatherCheckIcon({ className }: { className?: string }) {
    return (
        <CornerBadgedIcon
            icon={faFeather}
            badge={faCheck}
            badgeClassName="-bottom-1 -right-1.5"
            className={className}
        />
    );
}
