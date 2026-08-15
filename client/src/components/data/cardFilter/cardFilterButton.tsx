import { Badge, Button, Drawer, DrawerContent } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import { BaseElementProps } from "../../../types";
import CardFilterDrawer from "./cardFilterDrawer";
import { CardFilterValue, countActiveCardFilters } from "./types";

type CardFilterButtonProps = Omit<BaseElementProps, "children"> & {
    value: CardFilterValue;
    onChange: (value: CardFilterValue) => void;
    traits: string[];
    releases?: { code: string; name: string }[];
    isDisabled?: boolean;
};

const CardFilterButton = ({ className, style, value, onChange, traits, releases, isDisabled }: CardFilterButtonProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const activeCount = countActiveCardFilters(value);

    return (
        <>
            <Badge
                content={activeCount}
                color="primary"
                isInvisible={activeCount === 0}
                showOutline={false}
                className={className}
                style={style}
            >
                <Button isIconOnly size="sm" onPress={() => setIsOpen(true)} isDisabled={isDisabled} aria-label="Filter cards">
                    <FontAwesomeIcon icon={faFilter} />
                </Button>
            </Badge>
            <Drawer isOpen={isOpen} onOpenChange={setIsOpen} placement="left">
                <DrawerContent>
                    <CardFilterDrawer
                        value={value}
                        onChange={onChange}
                        traits={traits}
                        releases={releases}
                        onClose={() => setIsOpen(false)}
                    />
                </DrawerContent>
            </Drawer>
        </>
    );
};

export default CardFilterButton;
