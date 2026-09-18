import { Badge, Button, Drawer, DrawerContent, Input, Spinner } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter, faMagnifyingGlass, faXmarkCircle } from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import classNames from "classnames";
import { BaseElementProps } from "../../../types";
import SuggestionFilterDrawer from "./suggestionFilterDrawer";
import { countActiveSuggestionFilters, isSuggestionFilterActive, SuggestionFilterValue } from "./types";

type SuggestionFilterSearchBarProps = Omit<BaseElementProps, "children"> & {
    search: string;
    onSearchChange: (value: string) => void;
    filter: SuggestionFilterValue;
    onFilterChange: (value: SuggestionFilterValue) => void;
    traits: string[];
    users: { discordId: string; displayname: string }[];
    isDisabled?: boolean;
    // While debouncing or the resulting server search is in flight - shown in place of the clear button
    isSearching?: boolean;
};

// Search and Advanced read as one connected control that shrinks to just Advanced while filtering.
// Search text itself is left untouched (not cleared) - the caller ignores it while filtering is active.
const SuggestionFilterSearchBar = ({
    className,
    style,
    search,
    onSearchChange,
    filter,
    onFilterChange,
    traits,
    users,
    isDisabled,
    isSearching
}: SuggestionFilterSearchBarProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const isFiltering = isSuggestionFilterActive(filter);
    const activeCount = countActiveSuggestionFilters(filter);

    return (
        <div
            className={classNames(
                "grid items-stretch justify-end transition-[grid-template-columns] duration-200 ease-in-out flex-1 sm:flex-none sm:w-auto",
                isFiltering
                    ? "grid-cols-[0fr_auto] sm:grid-cols-[0rem_auto] !min-w-0"
                    : "grid-cols-[1fr_auto] sm:grid-cols-[14rem_auto]",
                className
            )}
            style={style}
        >
            <div className="overflow-hidden min-w-0">
                <Input
                    placeholder="Search suggestions..."
                    value={search}
                    onValueChange={onSearchChange}
                    startContent={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                    endContent={
                        isSearching ? (
                            <Spinner size="sm" aria-label="Searching" />
                        ) : search ? (
                            <button type="button" onClick={() => onSearchChange("")} aria-label="Clear search">
                                <FontAwesomeIcon icon={faXmarkCircle} className="text-default-400" />
                            </button>
                        ) : null
                    }
                    size="sm"
                    className="w-full"
                    classNames={{ inputWrapper: "rounded-r-none" }}
                    isDisabled={isDisabled || isFiltering}
                />
            </div>
            <Badge
                content={activeCount}
                color="primary"
                isInvisible={activeCount === 0}
                showOutline={false}
                className="justify-self-start"
            >
                <Button
                    size="sm"
                    variant="flat"
                    onPress={() => setIsOpen(true)}
                    isDisabled={isDisabled}
                    className={classNames(
                        "shrink-0 gap-1 transition-all duration-200 ease-in-out",
                        !isFiltering && "max-sm:w-8 max-sm:min-w-8 max-sm:!gap-0 max-sm:px-0",
                        {
                            "rounded-l-none": !isFiltering
                        }
                    )}
                >
                    <FontAwesomeIcon icon={faFilter} />
                    <span className={isFiltering ? "inline" : "hidden sm:inline"}>Advanced</span>
                </Button>
            </Badge>
            <Drawer isOpen={isOpen} onOpenChange={setIsOpen} placement="left">
                <DrawerContent>
                    <SuggestionFilterDrawer
                        value={filter}
                        onChange={onFilterChange}
                        traits={traits}
                        users={users}
                        onClose={() => setIsOpen(false)}
                    />
                </DrawerContent>
            </Drawer>
        </div>
    );
};

export default SuggestionFilterSearchBar;
