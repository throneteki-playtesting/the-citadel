import { CardPreview } from "@agot/card-preview";
import CardGrid from "../../components/cardGrid";
import { renderPlaytestingCard } from "common/utils";
import { Link } from "@heroui/react";
import { IProject } from "common/models/projects";
import { IPlaytestCard } from "common/models/cards";
import ProjectContentDraft from "./draft/projectContentDraft";

const ProjectContent = ({ project, cards, isLoading = false }: ProjectContentProps) => {
    if (project?.draft) {
        return <ProjectContentDraft project={project} cards={cards} isLoading={isLoading}/>;
    }
    return (
        <CardGrid cards={cards} isLoading={!cards || isLoading}>
            {(card) => (
                <Link key={card.code} href={`/project/${project?.number}/${card.number}`}>
                    <CardPreview
                        key={card.code}
                        card={renderPlaytestingCard(card)}
                        orientation="vertical"
                        rounded
                        className="transition-all"
                    />
                </Link>)}
        </CardGrid>
    );
};

type ProjectContentProps = { project?: IProject, cards?: IPlaytestCard[], isLoading?: boolean }

export default ProjectContent;