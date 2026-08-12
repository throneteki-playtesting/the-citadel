import { Select, SelectItem } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDownWideShort } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";

// The one sort control, shared so two lists sorting the same way look like the same control
export default function SortSelect<T extends string>({
    options,
    value,
    isDisabled,
    className,
    onChange
}: SortSelectProps<T>) {
    return (
        <Select
            size="sm"
            aria-label="Sort by"
            className={classNames("max-w-44", className)}
            selectedKeys={[value]}
            disallowEmptySelection
            isDisabled={isDisabled}
            startContent={<FontAwesomeIcon icon={faArrowDownWideShort} className="shrink-0 text-foreground/40" />}
            onSelectionChange={(keys) => onChange([...keys][0] as T)}
        >
            {Object.entries(options).map(([key, label]) => (
                <SelectItem key={key}>{label as string}</SelectItem>
            ))}
        </Select>
    );
}

type SortSelectProps<T extends string> = {
    /** Sort key to the name it goes by */
    options: Partial<Record<T, string>>;
    value: T;
    isDisabled?: boolean;
    className?: string;
    onChange: (value: T) => void;
};
