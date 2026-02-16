import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, Link } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";

const GithubStatus = ({ card }: GithubStatusProps) => {
    const title = "Github Issue";

    if (!card?.github) {
        return (
            <Alert color="danger" title={title}>
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
    }

    if (card.github.status === "closed") {
        return (
            <Alert color="default" title={title} endContent={endContent}>
                    Closed
            </Alert>
        );
    }

    if (card.github.status === "complete") {
        return (
            <Alert color="success" title={title} endContent={endContent}>
                    Merged
            </Alert>
        );
    }

    return null;
};

type GithubStatusProps = { card?: IPlaytestCard }

export default GithubStatus;