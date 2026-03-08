import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, Link } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";

const GithubStatus = ({ card }: GithubStatusProps) => {
    const title = "Github Issue";

    if (!card) {
        return null;
    }

    if (!card.github) {
        return (
            <Alert color="warning" title={title}>
                Missing
            </Alert>
        );
    }
    const href = card.github.issueUrl;
    const endContent = <Link href={href} target="_blank" className="text-3xl"><FontAwesomeIcon icon={faGithub}/></Link>;
    if (card.github.status === "open") {
        return (
            <Alert color="primary" title={title} endContent={endContent}>
                Open
            </Alert>
        );
    } else if (card.github.status === "closed") {
        return (
            <Alert color="success" title={title} endContent={endContent}>
                Closed
            </Alert>
        );
    } else {
        return (
            <Alert color="success" title={title} endContent={endContent}>
                Merged
            </Alert>
        );
    }
};

type GithubStatusProps = { card?: IPlaytestCard }

export default GithubStatus;