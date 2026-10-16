import { faFeather, faPlus } from "@fortawesome/free-solid-svg-icons";
import CornerBadgedIcon from "./cornerBadgedIcon";

// A feather, for what is drafted, with a plus beside it - what is added to one
export default function FeatherPlusIcon({ className }: { className?: string }) {
    return (
        <CornerBadgedIcon icon={faFeather} badge={faPlus} badgeClassName="-bottom-1 -right-1.5" className={className} />
    );
}
