import classNames from "classnames";
import { BaseElementProps } from "../../types";
import { IPlaytestCard } from "common/models/cards";
import { Button, Chip, Link, Skeleton } from "@heroui/react";
import { IProject } from "common/models/projects";
import { CardPreview } from "@agot/card-preview";
import { isPreview, renderPlaytestingCard } from "common/utils";
import CardVersionReviewStats from "./cardVersionReviewStats";
import dismoji, { emojis } from "../../emojis";
import { ReactElement, useMemo } from "react";
import ThronesIcon from "../../components/thronesIcon";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import PermissionGate from "../../components/permissionGate";
import { Permission } from "common/models/user";
import { useGetReviewsQuery } from "../../api";

const CardVersionDetail = ({ className, style, card, project, onEdit, onDelete }: CardVersionDetailProps) => {
    const { data: reviewsData, isLoading: isReviewsLoading } = useGetReviewsQuery({ filter: { project: project.number, number: card.number, version: card.version } });
    const title = useMemo(() => {
        if (isPreview(card)) {
            return `${card.name} (Preview)`;
        }
        return `${card.name}, ver. ${card.version}`;
    }, [card]);

    // TODO: Improve with custom color set (in tailwind settings)
    type TagColor = "default" | "success" | "secondary" | "primary" | "warning" | "danger";
    const tags = useMemo(() => {
        return [
            ...(card.latest ? [({ label:"Latest", color: "success" as TagColor })] : []),
            ...(card.draft ? [({ label:"Draft", color: "secondary" as TagColor })] : []),
            ...(isPreview(card) ? [({ label:"Preview", color: "warning" as TagColor })] : [])
        ];
    }, [card]);

    const decks = useMemo(() => {
        return reviewsData?.items.reduce<{ deck: string, reviewer: string }[]>((all, review) => {
            all.push(...review.decks.map((deck) => ({ deck, reviewer: review.reviewer })));
            return all;
        }, []) ?? [];
    }, [reviewsData?.items]);

    const buttons = useMemo(() => {
        const buttons: ReactElement[] = [];
        if (card.draft) {
            buttons.push(
                <PermissionGate requires={Permission.EDIT_CARDS}><Button color="default" startContent={<FontAwesomeIcon icon={faPencil}/>} onPress={() => onEdit(card)}>Edit</Button></PermissionGate>
            );
            if (!isPreview) {
                buttons.push(
                    <PermissionGate requires={Permission.DELETE_CARDS}><Button color="danger" startContent={<FontAwesomeIcon icon={faTrash}/>} onPress={() => onDelete(card)}>Delete</Button></PermissionGate>
                );
            }
        }
        return buttons;
    }, [card, onDelete, onEdit]);

    return (
        <div className={classNames("flex flex-col md:flex-row flex-wrap gap-5 p-4 bg-default-100 rounded-2xl", className)} style={style}>
            <CardPreview className="self-center max-w-64" card={renderPlaytestingCard(card)}/>
            <div className="flex-grow flex flex-col gap-1">
                <div className="flex flex-col">
                    <div className="text-2xl p-1 text-bold">{title}</div>
                    {tags.length > 0 &&
                        <div className="flex gap-1">
                            {tags.map((tag) => <Chip key={tag.label} variant="dot" color={tag.color}>{tag.label}</Chip>)}
                        </div>
                    }
                </div>
                {card.note && (
                    <div className="max-w-none bg-default-300 p-2 rounded-md space-y-1 inline-block">
                        <div className="font-bold">{`${dismoji["scroll"]} Change Notes ${dismoji[emojis[card.note.type] ?? emojis["other"]]}`}</div>
                        <div className="w-0 min-w-full">{card.note?.text}</div>
                    </div>
                )}

                <div className="flex flex-col gap-1 p-2">
                    <div className="font-bold">Review Statistics</div>
                    <div className="text-xs">{`Average review statistics for this card & version. There have been ${reviewsData?.items.length ?? 0} reviews.`}</div>
                    <Skeleton className="flex-grow min-h-32" isLoaded={!isReviewsLoading}>
                        {!isReviewsLoading && <CardVersionReviewStats reviews={reviewsData?.items} />}
                    </Skeleton>
                </div>
            </div>
            <Skeleton className="md:w-full lg:w-68" isLoaded={!isReviewsLoading}>
                {!isReviewsLoading && <div className="bg-default-50 p-4 rounded-xl flex flex-col gap-2">
                    <div className="text-xl font-bold">Public decks</div>
                    <div className="text-xs">Decks which were submitted in playtesting reviews for this card & version</div>
                    {
                        reviewsData?.items && decks.length > 0 ? decks.map((deck) =>
                            <Link key={deck.deck} href={deck.deck} className="flex gap-2 bg-default-100/50 p-2 rounded-sm">
                                <ThronesIcon name={card.faction}/> {deck.reviewer}
                            </Link>
                        ) : <div className="italic">No reviews/decks for this version</div>
                    }
                </div>}
            </Skeleton>
            { buttons.length > 0 && (
                <div className="basis-full flex justify-center">
                    <div className="flex gap-1">
                        {buttons}
                    </div>
                </div>
            )}
        </div>
    );
};

type CardVersionDetailProps = Omit<BaseElementProps, "children"> & {
    card: IPlaytestCard,
    project: IProject,
    onEdit: (card: IPlaytestCard) => void,
    onDelete: (card: IPlaytestCard) => void
};

export default CardVersionDetail;