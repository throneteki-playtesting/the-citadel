import { ReactNode } from "react";
import { Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClockRotateLeft, faFileLines } from "@fortawesome/free-solid-svg-icons";

/** Your own unfinished suggestions, both kinds - drafts not yet submitted, and legacy ones not yet completed.
 *  `children` is the trigger, so the desktop button and the phone's floating one share the one menu. */
export default function MyStashDropdown({
    draftsCount,
    legacyCount,
    onOpenDrafts,
    onOpenLegacy,
    children
}: MyStashDropdownProps) {
    return (
        <Dropdown placement="bottom-end">
            <DropdownTrigger>{children}</DropdownTrigger>
            <DropdownMenu
                aria-label="My Stash"
                disabledKeys={draftsCount > 0 ? [] : ["drafts"]}
                onAction={(key) => (key === "drafts" ? onOpenDrafts() : onOpenLegacy())}
            >
                <DropdownItem
                    key="drafts"
                    startContent={<FontAwesomeIcon icon={faFileLines} className="w-4 text-primary" />}
                    description="Not yet submitted"
                    endContent={
                        <Chip size="sm" variant="flat" color="primary">
                            {draftsCount}
                        </Chip>
                    }
                >
                    Draft Suggestions
                </DropdownItem>
                <DropdownItem
                    key="legacy"
                    startContent={<FontAwesomeIcon icon={faClockRotateLeft} className="w-4 text-primary" />}
                    description="Waiting to be completed"
                    endContent={
                        <Chip size="sm" variant="flat" color="primary">
                            {legacyCount}
                        </Chip>
                    }
                >
                    Legacy Suggestions
                </DropdownItem>
            </DropdownMenu>
        </Dropdown>
    );
}

type MyStashDropdownProps = {
    draftsCount: number;
    legacyCount: number;
    onOpenDrafts: () => void;
    onOpenLegacy: () => void;
    children: ReactNode;
};
