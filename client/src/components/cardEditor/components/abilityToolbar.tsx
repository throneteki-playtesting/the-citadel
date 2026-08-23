import { Editor, useEditorState } from "@tiptap/react";
import { memo, useMemo } from "react";
import { titleCase } from "common/utils";
import { PlotStat, plotStats } from "common/models/cards";
import { OverflowToolbar, ToolbarItem } from "../../editorToolbar";
import { iconItems } from "../../editorToolbar/iconItems";
import { Icon } from "../../thronesIcon";
import PlotStatIcon from "../../plotStatIcon";

// Memoised and subscribed to the editor itself: every prop is a primitive or a stable callback. Each
// button carries a tooltip, and rebuilding fifteen of them per character is what made typing lag
export const AbilityToolbar = memo(function AbilityToolbar({
    editor,
    isDisabled,
    activeStats,
    onToggleTrait,
    onInsertIcon,
    onTogglePlotModifier
}: {
    editor: Editor;
    isDisabled?: boolean;
    /** Comma separated, so a row of chips stays a primitive the memo can compare */
    activeStats: string;
    onToggleTrait: () => void;
    onInsertIcon: (icon: Icon) => void;
    onTogglePlotModifier: (stat: PlotStat) => void;
}) {
    const isTraitActive = useEditorState({
        editor,
        selector: ({ editor }) => !!editor?.isActive("trait")
    });

    // Icons before modifiers: a text box reaches for a challenge or faction icon far more often than it
    // adjusts a plot stat, so the modifiers are what drop into the overflow menu first
    const items = useMemo<ToolbarItem[]>(() => {
        const active = activeStats ? activeStats.split(",") : [];
        return [
            {
                key: "trait",
                label: "Trait",
                command: onToggleTrait,
                isActive: isTraitActive,
                className: "font-crimson italic font-bold text-medium",
                icon: <span>T</span>
            },
            ...iconItems(onInsertIcon),
            { kind: "divider", key: "divider-modifiers" },
            ...plotStats.map((stat) => ({
                key: stat,
                label: `${titleCase(stat)} modifier`,
                command: () => onTogglePlotModifier(stat),
                isActive: active.includes(stat),
                icon: <PlotStatIcon name={stat} />
            }))
        ];
    }, [activeStats, isTraitActive, onInsertIcon, onTogglePlotModifier, onToggleTrait]);

    return <OverflowToolbar items={items} isDisabled={isDisabled} className="bg-default p-1" />;
});
