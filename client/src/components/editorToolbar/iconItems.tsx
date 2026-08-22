import { abilityIcons, factionNames, titleCase } from "common/utils";
import { challengeIcons, factions } from "common/models/cards";
import ThronesIcon, { Icon } from "../thronesIcon";
import { ToolbarItem } from ".";

// Only the icons the font actually carries, so a name the game's data gains cannot draw a blank glyph
const challenges = challengeIcons.filter((icon) => icon in abilityIcons);
const houses = factions.filter((faction) => faction in abilityIcons);

function group(insert: (icon: Icon) => void, icons: string[], label: (icon: string) => string): ToolbarItem[] {
    return icons.map((icon) => ({
        key: icon,
        label: label(icon),
        command: () => insert(icon as Icon),
        icon: <ThronesIcon name={icon as Icon} />
    }));
}

// Challenges then houses, each behind a divider. Both toolbars end with this run, so whatever drops into
// the overflow menu drops the same way in either
export function iconItems(insert: (icon: Icon) => void): ToolbarItem[] {
    return [
        { kind: "divider", key: "divider-challenges" },
        ...group(insert, challenges, titleCase),
        { kind: "divider", key: "divider-factions" },
        ...group(insert, houses, (faction) => factionNames[faction as keyof typeof factionNames])
    ];
}
