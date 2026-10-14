import { memo } from "react";
import { Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAnglesDown } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { Faction } from "common/models/cards";
import { setFactionsExpanded, useAreFactionsExpanded } from "./expandedFactionsStore";

// Expands every faction while any is collapsed, otherwise collapses them all
const ExpandAllButton = memo(function ExpandAllButton({ project, factions }: ExpandAllButtonProps) {
    const isAllExpanded = useAreFactionsExpanded(project, factions);
    return (
        <Button
            size="sm"
            variant="flat"
            isDisabled={factions.length === 0}
            startContent={
                <FontAwesomeIcon
                    icon={faAnglesDown}
                    className={classNames("transition-transform duration-200", { "rotate-180": isAllExpanded })}
                />
            }
            onPress={() => setFactionsExpanded(project, isAllExpanded ? [] : factions)}
        >
            {isAllExpanded ? "Collapse all" : "Expand all"}
        </Button>
    );
});

export default ExpandAllButton;

type ExpandAllButtonProps = {
    project: number;
    /** The factions on show, in a stable array */
    factions: Faction[];
};
