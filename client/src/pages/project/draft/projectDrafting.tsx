import { parseCardCode } from "common/utils";
import { useMemo, useState } from "react";
import { IProject } from "common/models/projects";
import { Faction, IPlaytestCard } from "common/models/cards";
import { DeepPartial } from "common/types";
import EditCardModal from "../../card/editCardModal";
import DeleteCardModal from "../../card/deleteCardModal";
import EmptyCardSlot from "./emptyCardSlot";
import SelectSuggestionModal from "./selectSuggestionModal";
import PreviewCardSlot from "./previewCardSlot";
import LoadingCard from "../../../components/loadingCard";
import { addToast, Card } from "@heroui/react";

const ProjectDrafting = ({ project, cards, isLoading = false }: ProjectDraftingProps) => {
    const [editing, setEditing] = useState<DeepPartial<IPlaytestCard>>();
    const [suggesting, setSuggesting] = useState<{ faction: Faction, number: number }>();
    const [deleting, setDeleting] = useState<IPlaytestCard>();

    const cardMap = useMemo(() => {
        return cards?.reduce<Record<number, IPlaytestCard>>((map, card) => {
            map[card.number] = card;
            return map;
        }, {}) ?? {};
    }, [cards]);

    const cardSlots = useMemo(() => {
        if (!project || !project.draft) {
            return [];
        }
        const slots: (Faction | IPlaytestCard)[] = [];
        let slotNumber = 1;
        for (const faction of Object.keys(project.cardCount)) {
            for (let i = 0 ; i < project.cardCount[faction as Faction] ; i++) {
                // If card is created for that slot, use that. Otherwise, only faction is needed.
                slots.push(cardMap[slotNumber] ?? faction as Faction);
                slotNumber++;
            }
        }
        return slots.map((cardSlot, index) => {
            const number = index + 1;
            const code = parseCardCode(false, project.number, number);
            if (isLoading) {
                return <LoadingCard key={code}/>;
            } else if (typeof cardSlot === "string") {
                return (
                    <EmptyCardSlot
                        key={code}
                        code={code}
                        faction={cardSlot}
                        onNew={() => setEditing({ project: project.number, number, code, faction: cardSlot, version: "0.0.0" })}
                        onSuggestion={() => setSuggesting({ faction: cardSlot, number })}
                    />
                );
            } else {
                return (
                    <PreviewCardSlot
                        key={code}
                        card={cardSlot}
                        onEdit={() => setEditing(cardSlot)}
                        onDelete={() => setDeleting(cardSlot)}
                    />
                );
            }
        });
    }, [cardMap, isLoading, project]);

    return (
        <>
            <Card className="bg-content1/10 grid grid-cols-3 sm:grid-cols-4 gap-1">
                {cardSlots}
            </Card>
            <EditCardModal isOpen={!!editing} card={editing} onClose={() => setEditing(undefined)} onSave={(card) => addToast({ title: "Successfully saved", color: "success", description: `Slot #${card.number} has been saved` })}/>
            <SelectSuggestionModal
                isOpen={!!suggesting}
                project={project.number}
                number={suggesting?.number ?? 0}
                faction={suggesting?.faction}
                unselectable={cards?.filter((card) => card.faction === suggesting?.faction && card.suggestionId).map((card) => card.suggestionId!)}
                onClose={() => setSuggesting(undefined)}
                onSave={(card) => addToast({ title: "Successfully saved", color: "success", description: `Slot #${card.number} has been saved` })}
            />
            <DeleteCardModal isOpen={!!deleting} card={deleting} onClose={() => setDeleting(undefined)} onDelete={(card) => addToast({ title: "Successfully deleted", color: "success", description: `Slot #${card.number} has been deleted` })}/>
        </>
    );
};

type ProjectDraftingProps = { project: IProject, cards?: IPlaytestCard[], isLoading?: boolean }

export default ProjectDrafting;