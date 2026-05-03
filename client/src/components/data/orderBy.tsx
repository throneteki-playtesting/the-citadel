import { faArrowDown, faArrowUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Chip, Select, SelectItem, SelectProps, SharedSelection } from "@heroui/react";
import { EntriesOf, Sort } from "common/types";
import { flatten } from "flat";
import { useCallback, useMemo, useState } from "react";

type SortDir = "asc" | "desc";
const OrderBySelector = function<T>({ label = "Order By", orderBy = {}, setOrderBy, options, ...props }: OrderByProps<T>) {
    const [internal, setInternal] = useState<Record<string, SortDir>>(flatten(orderBy));

    const items = useMemo(() => {
        const flattened = flatten(options) as Record<string, string>;
        const entries = Object.entries(flattened) as [string, string][];
        return entries.map(([key, value]) => ({ key, value }));
    }, [options]);

    const handleSelectionChange = useCallback((keys: SharedSelection) => {
        const parseOrderBy = (sort: Record<string, SortDir>): Sort<T> | undefined => {
            const entries = Object.entries(sort) as [string, SortDir][];
            if (entries.length === 0) {
                return undefined;
            }

            const result: Record<string, unknown> = {};

            for (const [path, direction] of entries) {
                const parts = path.split(".");
                let current: Record<string, unknown> = result;

                for (let i = 0; i < parts.length - 1; i++) {
                    const part = parts[i];
                    if (typeof current[part] !== "object" || current[part] === null) {
                        current[part] = {};
                    }
                    current = current[part] as Record<string, unknown>;
                }

                const finalKey = parts[parts.length - 1];
                current[finalKey] = direction;
            }

            return result as Sort<T>;
        };

        let selected = keys.currentKey;
        if (!selected) {
            // Find missing key which was unselected
            const oldKeys = Object.keys(internal);
            const newKeys = Array.from(keys);
            selected = oldKeys.find((key) => !newKeys.includes(key));
            if (!selected) {
                return;
            }
        }

        setInternal((prev) => {
            const current = prev[selected];
            const next: Record<string, SortDir> = { ...prev };

            if (!current || current === "asc") {
                next[selected] = current ? "desc" : "asc";
            } else {
                delete next[selected];
            }

            const newOrderBy = parseOrderBy(next);
            setOrderBy(newOrderBy);
            return next;
        });
    }, [internal, setOrderBy]);

    const handleClear = useCallback(() => {
        setInternal({});
        setOrderBy({});
    }, [setOrderBy]);

    const getIcon = (direction: SortDir) => direction === "asc" ? faArrowUp : faArrowDown;
    return (
        <Select
            {...props}
            label={label}
            isClearable
            isMultiline
            selectionMode={"multiple"}
            items={items}
            selectedKeys={Object.keys(internal ?? {})}
            renderValue={(items) => {
                return (
                    <div className="py-1 flex flex-wrap gap-1">
                        {
                            items.map((item) =>
                                <Chip key={item.key} color="default" radius="sm" endContent={<FontAwesomeIcon icon={getIcon(internal[item.data!.key])}/>}>{item.data!.value}</Chip>
                            )
                        }
                    </div>);
            }}
            onSelectionChange={handleSelectionChange}
            onClear={handleClear}
        >
            {({ key, value }) =>
                <SelectItem key={key} className="text-medium">
                    {value}
                </SelectItem>
            }
        </Select>
    );
};

type OrderByProps<T> = { label?: string, orderBy?: Sort<T>, setOrderBy: (orderBys?: Sort<T>) => void, options: EntriesOf<T, string> } & Omit<SelectProps, "children">;

export default OrderBySelector;