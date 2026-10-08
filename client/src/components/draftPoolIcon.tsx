import { faFeather } from "@fortawesome/free-solid-svg-icons";
import { suggestionIcons } from "../constants";
import CornerBadgedIcon from "./cornerBadgedIcon";

// The suggestion's letter with the draft feather over its corner - what is set aside, and for a draft
export default function DraftPoolIcon({ className }: { className?: string }) {
    return (
        <CornerBadgedIcon
            icon={suggestionIcons.base}
            badge={faFeather}
            badgeClassName="-bottom-1 -right-1.5"
            className={className}
        />
    );
}
