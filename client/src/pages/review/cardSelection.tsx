import { CardPreview } from "@agot/card-preview";
import { faCircleArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { IPlaytestCard } from "common/models/cards";
import { renderPlaytestingCard } from "common/utils";
import { WizardNext } from "../../components/wizard";
import PlaytestCardGrid from "./reviewingCardGrid";
import { useGetProjectsQuery } from "../../api";
import { useMemo } from "react";

export default function CardSelection({ value: selected, onSelect, searchValue }: CardSelectionProps) {
    const { data: projectsData, isLoading: isLoadingProjects } = useGetProjectsQuery({ filter: { active: true } });
    const filter = useMemo(
        () =>
            isLoadingProjects
                ? undefined
                : { latest: true, project: { $in: projectsData?.items.map((project) => project.number) ?? [] } },
        [isLoadingProjects, projectsData]
    );

    if (isLoadingProjects) {
        return null;
    }

    return (
        <PlaytestCardGrid
            filter={filter}
            orderBy={{ project: "desc", number: "asc" }}
            search={searchValue}
            menuContent={
                <WizardNext
                    color="primary"
                    isDisabled={!selected}
                    endContent={<FontAwesomeIcon icon={faCircleArrowRight} />}
                >
                    Continue
                </WizardNext>
            }
        >
            {(card) => {
                const isSelected =
                    selected &&
                    selected.project === card.project &&
                    selected.number === card.number &&
                    selected.version === card.version;
                return (
                    <div
                        key={`${card.project}|${card.number}|${card.version}`}
                        className="h-fit cursor-pointer select-none"
                        onClick={() => onSelect(isSelected ? undefined : card)}
                    >
                        <CardPreview
                            card={renderPlaytestingCard(card)}
                            className={classNames("h-fit transition-all duration-500 ease-in-out", {
                                "ring-2 ring-primary": isSelected,
                                "brightness-50": selected && !isSelected
                            })}
                        />
                    </div>
                );
            }}
        </PlaytestCardGrid>
    );
}

type CardSelectionProps = {
    value?: IPlaytestCard;
    onSelect: (card?: IPlaytestCard) => void;
    searchValue?: string;
};
