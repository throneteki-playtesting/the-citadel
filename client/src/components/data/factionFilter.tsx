import { Select, SelectItem } from "@heroui/react";
import { Faction, factions as allFactions } from "common/models/cards";
import { factionNames } from "common/utils";
import ThronesIcon, { Icon } from "../thronesIcon";
import { BaseElementProps } from "../../types";

const FactionFilter = ({ className, style, label = "Factions", setFactions, factions = [] }: FactionFilterProps) => {
    const items = allFactions.map((faction) => ({ key: faction, label: factionNames[faction] }));
    return (
        <Select
            label={label}
            selectionMode={"multiple"}
            items={items}
            selectedKeys={factions}
            renderValue={(items) => (
                <div className="flex gap-1">
                    {items.map((item) => (
                        <ThronesIcon key={item.data?.key} name={item.data?.key as Icon} />
                    ))}
                </div>
            )}
            onSelectionChange={(keys) => setFactions([...keys] as Faction[])}
            className={className}
            style={style}
        >
            {(faction) => (
                <SelectItem key={faction.key} startContent={<ThronesIcon name={faction.key} />}>
                    {faction.label}
                </SelectItem>
            )}
        </Select>
    );
};

type FactionFilterProps = Omit<BaseElementProps, "children"> & {
    label?: string;
    setFactions: (factions: Faction[]) => void;
    factions?: Faction[];
};

export default FactionFilter;
