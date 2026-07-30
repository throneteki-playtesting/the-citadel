import { Chip, Select, SelectItem, SharedSelection } from "@heroui/react";
import { useGetTagsQuery } from "../../api";
import { useCallback } from "react";
import { BaseElementProps } from "../../types";

const TagFilter = ({ className, style, label, tags, setTags }: TagFilterProps) => {
    const { data, isLoading } = useGetTagsQuery();

    const handleSelectionChange = useCallback(
        (keys: SharedSelection) => {
            setTags(keys === "all" ? data! : Array.from(keys).map((key) => key.toString()));
        },
        [data, setTags]
    );
    return (
        <Select
            isLoading={isLoading}
            label={label}
            isMultiline
            selectionMode={"multiple"}
            items={data?.map((tag) => ({ tag })) ?? []}
            selectedKeys={tags}
            renderValue={(items) => (
                <div className="py-1 flex flex-wrap gap-1">
                    {items.map((item) => (
                        <Chip key={item.data?.tag} color="primary">
                            {item.data?.tag}
                        </Chip>
                    ))}
                </div>
            )}
            onSelectionChange={handleSelectionChange}
            className={className}
            style={style}
        >
            {({ tag }) => <SelectItem key={tag}>{tag}</SelectItem>}
        </Select>
    );
};

type TagFilterProps = Omit<BaseElementProps, "children"> & {
    label?: string;
    tags: string[];
    setTags: (tags: string[]) => void;
};

export default TagFilter;
