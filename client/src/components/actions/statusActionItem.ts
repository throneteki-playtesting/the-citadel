import { StatusData } from "../status/baseStatus";
import { ActionItem } from "./types";

/** Presents a status as a header action, so it can sit in the mobile dropdown's status section.
 *  Long-press options are dropped - only a status' own rendering offers those. */
export function statusActionItem(
    key: string,
    status: StatusData | null | undefined,
    overrides?: Partial<ActionItem>
): ActionItem | false {
    if (!status) {
        return false;
    }
    return {
        key,
        title: status.title,
        description: status.description,
        icon: status.icon,
        color: status.color,
        onPress: status.onPress,
        href: status.href,
        openInNewTab: status.openInNewTab,
        // Pressing a status which syncs leaves the menu open, so its progress stays visible
        keepOpen: !status.href,
        isStatus: true,
        ...overrides
    };
}
