import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";

/**
 * The way out to whatever a link actually points at. Renders nothing until there is a link, so an
 * empty field carries no affordance to follow.
 */
export default function ExternalLinkButton({ url, label }: ExternalLinkButtonProps) {
    if (!url) {
        return null;
    }

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="text-foreground/40 hover:text-foreground focus-visible:text-foreground rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
            <FontAwesomeIcon icon={faUpRightFromSquare} aria-hidden="true" />
        </a>
    );
}

type ExternalLinkButtonProps = {
    url?: string;
    /** What is being opened, eg. "Open in a new tab" */
    label: string;
};
