import { ReactNode } from "react";
import { UIColor } from "../../types";

export type ActionItem = {
    key: string;
    title: ReactNode;
    description?: ReactNode;
    icon: ReactNode;
    color?: UIColor;
    onPress?: () => void;
    href?: string;
    /** Whether an href action opens in a new tab. Defaults to true; set false for custom-protocol/deep-link hrefs (eg. discord://), which browsers often refuse to open in a new tab. */
    openInNewTab?: boolean;
    isDisabled?: boolean;
    isLoading?: boolean;
    keepOpen?: boolean;
    /** Small numeric badge shown on the action's button; hidden when 0 or undefined. */
    badge?: number;
    /** Groups the item into the leading status section, divided from the actions beneath it. */
    isStatus?: boolean;
    /** Leaves the item out of the desktop button group - for statuses with their own desktop rendering. */
    isDropdownOnly?: boolean;
};
