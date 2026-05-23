import { BaseElementProps } from "../../types";
import { Button, ButtonGroup, Card, Chip, Link, Skeleton } from "@heroui/react";
import { IProject } from "common/models/projects";
import { IPlaytestCard } from "common/models/cards";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faPencil, faX } from "@fortawesome/free-solid-svg-icons";
import PermissionGate from "../../components/permissionGate";
import Permission from "common/models/permissions";
import classNames from "classnames";
import ProjectHeaderDraftNotice from "./draft/projectHeaderDraftNotice";
import ProjectPlaytestingUpdates from "./playtestingUpdate/projectPlaytestingUpdates";
import { IPlaytestReview } from "common/models/reviews";
import { useMemo, ReactNode } from "react";
import { daysFromNow } from "../../utils";
import { useGetCardsQuery, useGetReviewsQuery } from "../../api";

const ProjectHeader = ({ className, style, project, onEdit = () => true, onDelete = () => true }: ProjectHeaderProps) => {
    const { data: cardsData, isLoading: isLoadingCardsData } = useGetCardsQuery({ filter: { project: project.number, latest: true } });
    const { data: reviewsData, isLoading: isLoadingReviewsData } = useGetReviewsQuery({ filter: { project: project.number } });

    const isLoading = useMemo(() => isLoadingCardsData || isLoadingReviewsData, [isLoadingCardsData, isLoadingReviewsData]);

    if (isLoading) {
        // TODO: Improve this once header details are more finalised
        return (
            <div className={classNames("flex flex-col gap-2", className)} style={style}>
                <Skeleton className="h-4 sm:h-5 md:h-6 w-42 sm:w-64 rounded-lg"/>
                <Skeleton className="h-4 sm:h-5 md:h-6 w-36 sm:w-52 rounded-lg"/>
                <Skeleton className="h-4 sm:h-5 md:h-6 w-52 sm:w-74 rounded-lg"/>
            </div>
        );
    }

    return (
        <Card className={classNames("p-4 bg-content1/10 space-y-2 md:space-y-4", className)} style={style}>
            <ButtonGroup className="absolute top-0 right-0 p-2">
                <PermissionGate requires={Permission.EDIT_PROJECTS}>
                    <Button isIconOnly variant="flat" size="sm" onPress={onEdit}><FontAwesomeIcon icon={faPencil}/></Button>
                </PermissionGate>
                <PermissionGate requires={Permission.DELETE_PROJECTS}>
                    <Button isIconOnly variant="flat" size="sm" color="danger" onPress={onDelete}><FontAwesomeIcon icon={faX}/></Button>
                </PermissionGate>
                {project.draft}
            </ButtonGroup>
            <div className="flex flex-col gap-2">
                <div className="text-xxs tracking-widest uppercase text-foreground/40">
                        #{project.number} · <span className="uppercase">{project.type} · {project.version} updates</span>{project.mandateUrl && (<> · <Link href={project.mandateUrl} className="cursor-pointer text-xxs">Mandate <FontAwesomeIcon icon={faArrowUpRightFromSquare}/></Link></>)}
                </div>
                <div className="font-semibold text-2xl lg:text-3xl">{project.name}</div>
            </div>
            {project.draft && cardsData?.items && <ProjectHeaderDraftNotice project={project} cards={cardsData.items} className="w-1/2"/>}
            {project.description && <div className="text-sm lg:text-medium py-1">{project.description}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="grid grid-cols-2 gap-1">
                    <Card className="bg-content1/10"><ReviewsStat reviews={reviewsData?.items} isLoading={isLoading} /></Card>
                    <Card className="bg-content1/10"><CardChangesStat latest={cardsData?.items} isLoading={isLoading} /></Card>
                    <Card className="bg-content1/10"><ActiveDecksStat reviews={reviewsData?.items} isLoading={isLoading} /></Card>
                    <Card className="bg-content1/10"><PacksStat latest={cardsData?.items} isLoading={isLoading} /></Card>
                </div>
                <ProjectPlaytestingUpdates project={project} />
            </div>
        </Card>
    );
};

type ProjectHeaderProps = Omit<BaseElementProps, "children"> & {
    project: IProject,
    onEdit?: () => void,
    onDelete?: () => void
};

function ReviewsStat({ reviews = [], isLoading }: ReviewsStatProps) {
    const amount = useMemo(() => reviews.length, [reviews.length]);
    const reviewers = useMemo(() => new Set(reviews.map((review) => review.reviewer)), [reviews]);

    return <ProjectStat label="Reviews this cycle" value={amount} footer={`from ${reviewers.size} playtesters`} isLoading={isLoading} />;
}
type ReviewsStatProps = {
    reviews?: IPlaytestReview[];
    isLoading?: boolean;
}

function CardChangesStat({ latest = [], isLoading }: CardChangesStatProps) {
    const dayRange = 7;
    const cards = useMemo(() => latest.filter((card) => new Date(card.updated) >= daysFromNow(-dayRange)), [latest]);
    const factions = useMemo(() => new Set(cards.map((card) => card.faction)), [cards]);

    return <ProjectStat label={`Changes · ${dayRange} days`} value={cards.length} footer={`accross ${factions.size} faction${factions.size !== 1 ? "s" : ""}`} isLoading={isLoading}/>;
}
type CardChangesStatProps = {
    latest?: IPlaytestCard[];
    isLoading?: boolean;
}

function ActiveDecksStat({ reviews = [], isLoading }: ActiveDecksStatProps) {
    const decks = useMemo(() => new Set(reviews.reduce<string[]>((decks, review) => [...decks, ...review.decks], [])), [reviews]);

    return <ProjectStat label="Submitted Decks" value={decks.size} footer="from ThronesDB" isLoading={isLoading}/>;
}
type ActiveDecksStatProps = {
    reviews?: IPlaytestReview[];
    isLoading?: boolean;
}

function PacksStat({ latest = [], isLoading }: PacksStatProps) {
    // TODO: Improve this when we have WIP packs implemented
    const packs = useMemo(() => [...new Set(latest.filter((card) => !!card.release).map((card) => card.release!.short))], [latest]);
    const packChips = packs.length > 0 ? (
        <div className="flex flex-wrap gap-1">
            {packs.map((pack) => <Chip key={pack} size="sm" variant="bordered">{pack}</Chip>)}
        </div>) : <span className="text-lg italic">None</span>;

    return <ProjectStat label="Released Packs" value={packChips} isLoading={isLoading} />;
}
type PacksStatProps = {
    latest?: IPlaytestCard[];
    isLoading?: boolean;
}

function ProjectStat({ label, value, footer, isLoading = false }: ProjectStatProps) {
    if (isLoading) {
        return (
            <div className="px-6 py-4 space-y-1">
                <Skeleton className="h-4 w-32 rounded-sm"/>
                <Skeleton className="h-12 w-16 rounded-sm"/>
                <Skeleton className="h-4 w-28 rounded-sm" />
            </div>
        );
    }
    return (
        <div className="px-6 py-4">
            <div className="text-xxs tracking-wide uppercase text-foreground/40 mb-2">
                {label}
            </div>
            <div className="text-3xl font-light text-foreground leading-none">{value}</div>
            {footer && <div className="text-xs italic text-foreground/40 mt-1.5">{footer}</div>}
        </div>
    );
}
type ProjectStatProps = {
    label: string;
    value: ReactNode;
    footer?: ReactNode;
    isLoading?: boolean;
}

export default ProjectHeader;