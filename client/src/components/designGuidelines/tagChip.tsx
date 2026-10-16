import { memo } from "react";
import { Chip } from "@heroui/react";
import classNames from "classnames";
import { TagKind, tagKindLabels } from "common/designGuidelines/suggestionTags";
import { BaseElementProps } from "../../types";
import { tagColor } from "./tagColors";

// One tag, coloured by its kind - a tag no option uses any more has none, and reads as plain
const TagChip = memo(function TagChip({ className, style, tag, kind, size = "sm", onClose }: TagChipProps) {
    return (
        <Chip
            size={size}
            variant="flat"
            color={tagColor(kind)}
            title={kind ? tagKindLabels[kind] : undefined}
            onClose={onClose}
            className={classNames(
                "rounded-sm uppercase tracking-wide",
                size === "sm" ? "h-5 text-xxs" : "h-7 text-xs",
                className
            )}
            style={style}
        >
            {tag}
        </Chip>
    );
});

type TagChipProps = Omit<BaseElementProps, "children"> & {
    tag: string;
    kind?: TagKind;
    /** md is for where a tag is the thing being picked, such as a dropdown option */
    size?: "sm" | "md";
    onClose?: () => void;
};

export default TagChip;
