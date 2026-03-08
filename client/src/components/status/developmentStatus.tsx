import { faExternalLink } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, Link } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";
import { parseCardCode } from "common/utils";

const DevelopmentStatus = ({ draft, latest }: DevelopmentStatusProps) => {
    // TODO: More options for this, potentially with manual updates from dt?
    const title = "Development Status";

    if (draft) {
        return (
            <Alert color="secondary" title={title}>
                    Drafting changes (v{draft.version})
            </Alert>
        );
    }

    if (!latest) {
        return (
            <Alert color="danger" title={title}>
                Missing Latest
            </Alert>
        );
    }

    if (latest.release) {
        const href = `https://thronesdb.com/card/${parseCardCode(true, latest.project, latest.release.number)}`;
        return (
            <Alert color="success" title={title} endContent={<Link href={href} target="_blank"><FontAwesomeIcon icon={faExternalLink} className="text-xl"/></Link>}>
                    Released in {latest.release.short}
            </Alert>
        );
    }
    return (
        <Alert color="success" title={title}>
                Playtesting Latest
        </Alert>
    );
};

type DevelopmentStatusProps = { draft?: IPlaytestCard, latest?: IPlaytestCard }

export default DevelopmentStatus;