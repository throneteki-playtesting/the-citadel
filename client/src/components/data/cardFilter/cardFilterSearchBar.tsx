import { Badge, Button, Drawer, DrawerContent, Input } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter, faMagnifyingGlass, faXmarkCircle } from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import classNames from "classnames";
import { BaseElementProps } from "../../../types";
import CardFilterDrawer from "./cardFilterDrawer";
import { CardFilterValue, countActiveCardFilters, isCardFilterActive } from "./types";

type CardFilterSearchBarProps = Omit<BaseElementProps, "children"> & {
    search: string;
    onSearchChange: (value: string) => void;
    filter: CardFilterValue;
    onFilterChange: (value: CardFilterValue) => void;
    traits: string[];
    releases?: { code: string; name: string }[];
    isDisabled?: boolean;
};

// Search and Advanced read as one connected control that shrinks to just Advanced while filtering.
// Search text itself is left untouched (not cleared) - the caller ignores it while filtering is active.
const CardFilterSearchBar = ({
    className,
    style,
    search,
    onSearchChange,
    filter,
    onFilterChange,
    traits,
    releases,
    isDisabled
}: CardFilterSearchBarProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const isFiltering = isCardFilterActive(filter);
    const activeCount = countActiveCardFilters(filter);

    return (
        <div
            className={classNames(
                "grid items-stretch justify-end transition-[grid-template-columns] duration-200 ease-in-out flex-1 sm:flex-none sm:w-auto",
                isFiltering
                    ? "grid-cols-[0fr_auto] sm:grid-cols-[0rem_auto]"
                    : "grid-cols-[1fr_auto] sm:grid-cols-[14rem_auto]",
                className
            )}
            style={style}
        >
            <div className="overflow-hidden min-w-0">
                <Input
                    placeholder="Search cards..."
                    value={search}
                    onValueChange={onSearchChange}
                    startContent={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                    endContent={
                        search ? (
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
                    <CardFilterDrawer
                        value={filter}
                        onChange={onFilterChange}
                        traits={traits}
                        releases={releases}
                        onClose={() => setIsOpen(false)}
                    />
                </DrawerContent>
            </Drawer>
        </div>
    );
};

export default CardFilterSearchBar;
