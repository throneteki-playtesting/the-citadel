import { addToast, BreadcrumbItem, Breadcrumbs, Button, ButtonGroup, Skeleton, Spacer } from "@heroui/react";
import { BaseElementProps } from "../../types";
import { useCallback, useMemo, useState } from "react";
import { useGetCardsQuery, useGetProjectQuery } from "../../api";
import CardVersionDetail from "./cardVersionDetail";
import { IPlaytestCard } from "common/models/cards";
import EditCardModal from "./editCardModal";
import DeleteCardModal from "./deleteCardModal";
import { cloneDeep } from "lodash";
import LoadingCard from "../../components/loadingCard";

const CardDetail = ({ className, style, project: projectNumber, number }: CardDetailProps) => {
    const [editing, setEditing] = useState<IPlaytestCard>();
    const [deleting, setDeleting] = useState<IPlaytestCard>();

    const { data: cardsData, ...cardsQuery } = useGetCardsQuery({ filter: { project: projectNumber, number } });
    const { data: project, ...projectQuery } = useGetProjectQuery({ number: projectNumber });

    const cardDetails = useCallback(() => {
        if (cardsQuery.isLoading || projectQuery.isLoading) {
            return (
                <div className="flex flex-col md:flex-row flex-wrap gap-5 p-4 bg-default-100 rounded-2xl min-h-98">
                    <LoadingCard className="self-center w-64" />
                    <div className="flex flex-col p-2 gap-2">
                        <Skeleton className="h-4 sm:h-5 md:h-6 w-42 sm:w-64 rounded-lg"/>
                        <Skeleton className="h-4 sm:h-5 md:h-6 w-36 sm:w-52 rounded-lg"/>
                        <Skeleton className="h-4 sm:h-5 md:h-6 w-52 sm:w-74 rounded-lg"/>
                    </div>
                    <Skeleton className="grow h-32 rounded-xl"/>
                </div>
            );
        }

        if (!project) {
            return null;
        }

        return cardsData?.items.map((card) => <CardVersionDetail key={`${card.number}|${card.version}`} card={card} project={project} onEdit={setEditing} onDelete={setDeleting}/>) ?? [];
    }, [cardsData?.items, cardsQuery.isLoading, project, projectQuery.isLoading]);

    const { latest, draft } = useMemo(() => {
        let latest = undefined;
        let draft = undefined;
        for (const card of cardsData?.items ?? []) {
            if (!latest && card.latest) {
                latest = card;
            }
            if (!draft && card.draft) {
                draft = card;
            }
            if (latest && draft) {
                break;
            }
        }
        return { latest, draft };
    }, [cardsData?.items]);

    const onNewVersion = useCallback((latest: IPlaytestCard) => {
        const draft = cloneDeep(latest);
        delete draft.note;
        setEditing(draft);
    }, []);

    return (
        <>
            <div className={className} style={style}>
                <Breadcrumbs size="lg">
                    <BreadcrumbItem href={`/project/${projectNumber}`}>{project?.name}</BreadcrumbItem>
                    <BreadcrumbItem isCurrent>#{latest?.code}</BreadcrumbItem>
                </Breadcrumbs>
                <ButtonGroup>
                    {!draft && latest && <Button onPress={() => onNewVersion(latest)}>New Version</Button>}
                </ButtonGroup>
                <Spacer/>
                <div className="flex flex-col-reverse gap-2">
                    {cardDetails()}
                </div>
            </div>
            <EditCardModal isOpen={!!editing} card={editing} onClose={() => setEditing(undefined)} onSave={(card) => addToast({ title: "Successfully saved", color: "success", description: `'${card.name}' ver. ${card.version} has been ${draft ? "edited" : "created"}` })}/>
            <DeleteCardModal isOpen={!!deleting} card={deleting} onClose={() => setDeleting(undefined)} onDelete={(card) => addToast({ title: "Successfully deleted", color: "success", description: `'${card.name}' ver. ${card.version} has been deleted` })}/>
        </>
    );
};

type CardDetailProps = Omit<BaseElementProps, "children"> & { project: number, number: number };

export default CardDetail;