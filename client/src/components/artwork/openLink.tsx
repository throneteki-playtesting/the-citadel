import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";

/**
 * The way out to whatever a link actually points at, sat at the trailing edge of the field holding it.
 * Renders nothing until there is a link, so an empty field carries no affordance to follow.
 */
export default function OpenLink({ url, label }: OpenLinkProps) {
    if (!url) {
        return null;
    }

    return (
        <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label={label}
            className="text-foreground/40 hover:text-foreground"
        >
            <FontAwesomeIcon icon={faUpRightFromSquare} />
        </a>
    );
}

type OpenLinkProps = {
    url?: string;
    /** What is being opened, eg. "Open artwork in a new tab" */
    label: string;
};
