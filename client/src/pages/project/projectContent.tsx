import { CardPreview } from "@agot/card-preview";
import CardGrid from "../../components/cardGrid";
import { parseCardCode, renderPlaytestingCard } from "common/utils";
import { Link, Tooltip } from "@heroui/react";
import { IProject } from "common/models/projects";
import { IPlaytestCard } from "common/models/cards";
import ProjectContentDraft from "./draft/projectContentDraft";
import CardImage from "../../components/cardImage";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar } from "@fortawesome/free-solid-svg-icons";
import { useGetCardsQuery } from "../../api";
import { useMemo } from "react";
import classNames from "classnames";

const ProjectContent = ({ project, cards, isLoading = false }: ProjectContentProps) => {
    if (project?.draft) {
        return <ProjectContentDraft project={project} cards={cards} isLoading={isLoading}/>;
    }

    return (
        <CardGrid cards={cards} isLoading={!cards || isLoading}>
            {(card) => (
                <Link key={parseCardCode(false, card.project, card.number)} href={`/project/${project?.number}/${card.number}`} className="aspect-[240/333]">
                    <ProjectContentCard card={card} />
                </Link>)}
        </CardGrid>
    );
};

type ProjectContentProps = { project?: IProject, cards?: IPlaytestCard[], isLoading?: boolean }

const ProjectContentCard = ({ card }: ProjectContentCardProps) => {
    const { data: draftData } = useGetCardsQuery({ filter: { project: card.project, number: card.number, draft: true } });
    const hasDraft = useMemo(() => draftData && draftData.total > 0, [draftData]);

    if (card.release) {
        return <CardImage card={card} />;
    }
    return <div className="w-full flex justify-center items-center">
        <div className="relative w-full">
            <CardPreview
                card={renderPlaytestingCard(card)}
                rounded
                className="transition-all"
            />
            <Tooltip placement="bottom" content="New version being drafted" className={classNames("transition-opacity duration-500", { "opacity-0": !hasDraft })}>
                <FontAwesomeIcon icon={faStar} className={classNames("absolute top-0 right-0 m-2 text-3xl text-gray-500 transition-opacity duration-500", { "opacity-0": !hasDraft, "opacity-75": hasDraft })}/>
            </Tooltip>
        </div>
    </div>;
};

type ProjectContentCardProps = { card: IPlaytestCard }

export default ProjectContent;