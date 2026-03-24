import { faExternalLink, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, Link, Tooltip } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";

const ImplementStatus = ({ card }: ImplementStatusProps) => {
    const title = "Online Platform";
    const href = "https://playtesting.theironthrone.net"; // TODO: Make env variable?

    if (!card) {
        return null;
    }

    if (card.implemented) {
        return (
            <Alert color="success" title={title} endContent={<Link href={href} target="_blank"><FontAwesomeIcon icon={faExternalLink} className="text-xl"/></Link>}>
                <span>Implemented {card.draft && <Tooltip content="Requires a Playtesting Update"><FontAwesomeIcon icon={faWarning} className="text-orange-500 animate-pulse"/></Tooltip>}</span>
            </Alert>
        );
    } else {
        return (
            <Alert color="warning" title={title} endContent={<Link href={href} target="_blank"><FontAwesomeIcon icon={faExternalLink} className="text-xl"/></Link>}>
                <span className="text-sm">Not Implemented</span>
            </Alert>
        );
    }
};

type ImplementStatusProps = { card?: IPlaytestCard }

export default ImplementStatus;