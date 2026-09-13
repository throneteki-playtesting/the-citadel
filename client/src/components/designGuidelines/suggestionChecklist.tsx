import { RuleResult } from "common/designGuidelines/checklistRules";
import { ChecklistJustifications } from "common/models/cards";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircle, faCircleCheck } from "@fortawesome/free-regular-svg-icons";
import { faCircleInfo, faListCheck, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Textarea } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useRef, useState } from "react";
import classNames from "classnames";
import { BaseElementProps } from "../../types";
import { EASE_STANDARD } from "../../constants";
import { TouchTooltip } from "../touchTooltip";
import { useWizardPageSubmitted } from "../wizard/context";
import StatusNotice, { StatusNoticeColor } from "../statusNotice";

const ROW_TRANSITION = { duration: 0.25, ease: EASE_STANDARD } as const;

// Same "icon + colour say how it's doing" convention as artworkChecklist.tsx/refinementChecklist.tsx -
// warn outranks indeterminate, since an active problem outweighs "can't tell yet".
function checklistNoticeStatus(results: RuleResult[]): { icon: typeof faListCheck; color: StatusNoticeColor } {
    if (results.every((result) => result.status === "pass")) {
        return { icon: faCircleCheck, color: "success" };
    }
    if (results.some((result) => result.status === "warn")) {
        return { icon: faListCheck, color: "warning" };
    }
    return { icon: faListCheck, color: "neutral" };
}

const CHECKLIST_JUSTIFICATION_REQUIRED_MESSAGE = "Provide a reason for this checklist item.";

// warn needs action, indeterminate can't be judged yet, pass is settled - in that order, so a
// glance at the top of the list finds whatever's still worth looking at first
const STATUS_ORDER: Record<RuleResult["status"], number> = { warn: 0, indeterminate: 1, pass: 2 };

/** Warnings first, settled passes last - ties keep `checklistRules()`'s own fixed order */
function sortByStatus(results: RuleResult[]) {
    return results
        .map((result, index) => ({ result, index }))
        .sort((a, b) => {
            const byStatus = STATUS_ORDER[a.result.status] - STATUS_ORDER[b.result.status];
            return byStatus !== 0 ? byStatus : a.index - b.index;
        })
        .map(({ result }) => result);
}

function RuleMark({ status, className }: { status: RuleResult["status"]; className?: string }) {
    if (status === "pass") {
        return <FontAwesomeIcon icon={faCircleCheck} className={classNames("shrink-0 text-success", className)} />;
    }
    if (status === "warn") {
        return (
            <FontAwesomeIcon icon={faTriangleExclamation} className={classNames("shrink-0 text-warning", className)} />
        );
    }
    // Indeterminate - can't be checked yet. Same blank circle the artwork/refinement checklists
    // use for "not done", so every checklist in the app reads the same way.
    return <FontAwesomeIcon icon={faCircle} className={classNames("shrink-0 text-foreground/30", className)} />;
}

/** A rule's extra explanatory detail (eg. what a calculated number means), in a small padded panel */
function RuleTooltip({ tooltip }: { tooltip: string }) {
    return (
        <TouchTooltip
            content={<div className="max-w-64 py-1 text-xs leading-relaxed text-foreground/80">{tooltip}</div>}
        >
            <span className="cursor-help text-foreground/40 hover:text-foreground/70">
                <FontAwesomeIcon icon={faCircleInfo} />
            </span>
        </TouchTooltip>
    );
}

/** Icon + label only, the always-visible status strip beside the card - deliberately NOT re-sorted
 *  by status, or a row would jump position every time an answer changes. */
export function MiniChecklist({
    className,
    style,
    results
}: { results: RuleResult[] } & Omit<BaseElementProps, "children">) {
    return (
        <ul className={classNames("flex flex-col -mt-1", className)} style={style}>
            <AnimatePresence initial={false}>
                {results.map((result) => (
                    <motion.li
                        key={result.rule}
                        className="overflow-hidden"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={ROW_TRANSITION}
                    >
                        <div className="flex items-start gap-1.5 pt-1 text-xs text-foreground/70">
                            <RuleMark status={result.status} className="mt-0.5" />
                            <span className="min-w-0 flex-1">{result.label}</span>
                            {result.tooltip && <RuleTooltip tooltip={result.tooltip} />}
                        </div>
                    </motion.li>
                ))}
            </AnimatePresence>
        </ul>
    );
}

/** Icon + label, warnings-first - a slimmed-down summary meant to sit permanently on screen. The one
 *  thing it keeps beyond `MiniChecklist`: a warn row still shows its recorded justification. */
export function SlimChecklist({
    className,
    style,
    results,
    justifications
}: { results: RuleResult[]; justifications?: ChecklistJustifications } & Omit<BaseElementProps, "children">) {
    return (
        <ul className={classNames("flex flex-col gap-1.5", className)} style={style}>
            <AnimatePresence initial={false}>
                {sortByStatus(results).map((result) => (
                    <motion.li
                        key={result.rule}
                        className="overflow-hidden"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={ROW_TRANSITION}
                    >
                        <div className="flex items-start gap-1.5 text-xs">
                            <RuleMark status={result.status} className="mt-0.5" />
                            <span className="min-w-0 flex-1">{result.label}</span>
                            {result.tooltip && <RuleTooltip tooltip={result.tooltip} />}
                        </div>
                        {result.status === "warn" && (
                            // A quoted reply to the warning above it, Discord-style - continuing
                            // straight down from the icon above, dimmed relative to the row it answers.
                            <div className="mt-1 ml-1.5 border-l-2 border-content3 pl-2.5 text-xs italic text-foreground/50">
                                {justifications?.[result.rule]?.trim() || "No reason recorded."}
                            </div>
                        )}
                    </motion.li>
                ))}
            </AnimatePresence>
        </ul>
    );
}

/** `MiniChecklist` wrapped to match artworkChecklist.tsx/refinementChecklist.tsx's own look - icon +
 *  coloured border via StatusNotice, rather than a bare list of rows. Used in the editor's rail. */
export function MiniChecklistNotice({
    className,
    results
}: { results: RuleResult[] } & Omit<BaseElementProps, "children" | "style">) {
    const { icon, color } = checklistNoticeStatus(results);
    return (
        <StatusNotice
            icon={icon}
            iconPosition="title"
            color={color}
            label="Checklist"
            detail={<MiniChecklist results={results} />}
            className={className}
        />
    );
}

/** `SlimChecklist` wrapped the same way as `MiniChecklistNotice` above - the read-only view used on
 *  the suggestion detail page. */
export function SlimChecklistNotice({
    className,
    results,
    justifications
}: { results: RuleResult[]; justifications?: ChecklistJustifications } & Omit<BaseElementProps, "children" | "style">) {
    const { icon, color } = checklistNoticeStatus(results);
    return (
        <StatusNotice
            icon={icon}
            iconPosition="title"
            color={color}
            label="Checklist"
            detail={<SlimChecklist results={results} justifications={justifications} />}
            className={className}
        />
    );
}

/** Collapsed-mobile form: icons only, centered - the whole bar is one tap target elsewhere, so
 *  these don't need their own tooltip competing for the tap. */
export function MiniChecklistIcons({
    className,
    style,
    results
}: { results: RuleResult[] } & Omit<BaseElementProps, "children">) {
    return (
        <div className={classNames("flex items-center justify-center gap-3 text-lg", className)} style={style}>
            <AnimatePresence initial={false}>
                {results.map((result) => (
                    <motion.span
                        key={result.rule}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={ROW_TRANSITION}
                    >
                        <RuleMark status={result.status} />
                    </motion.span>
                ))}
            </AnimatePresence>
        </div>
    );
}

/** Kept apart from `FullChecklist` (same reason as `AbilityEditor`'s own local state) - the parent
 *  only hears on blur. Shows invalid once `useWizardPageSubmitted()` says Next/Submit was pressed. */
function JustificationTextarea({
    rule,
    justification,
    onJustificationChange,
    isDisabled
}: {
    rule: RuleResult["rule"];
    justification: string;
    onJustificationChange: (rule: RuleResult["rule"], justification: string) => void;
    isDisabled?: boolean;
}) {
    const [text, setText] = useState(justification);
    const lastEmitted = useRef(justification);
    const isFocused = useRef(false);
    const hasAttemptedSubmit = useWizardPageSubmitted();

    // Mirrors AbilityEditor's own sync effect - only while unfocused, so an external change (eg.
    // switching between suggestions) can never yank text out from under someone still typing.
    useEffect(() => {
        if (justification === lastEmitted.current) {
            return;
        }
        if (!isFocused.current) {
            lastEmitted.current = justification;
            setText(justification);
        }
    }, [justification]);

    const commit = () => {
        if (text === lastEmitted.current) {
            return;
        }
        lastEmitted.current = text;
        onJustificationChange(rule, text);
    };

    const isMissing = hasAttemptedSubmit && !text.trim();

    return (
        <Textarea
            name={`checklistJustifications.${rule}`}
            size="sm"
            minRows={2}
            value={text}
            onValueChange={setText}
            onFocus={() => {
                isFocused.current = true;
            }}
            onBlur={() => {
                isFocused.current = false;
                commit();
            }}
            isDisabled={isDisabled}
            isRequired
            // Only ever forced to `true`, never `false` - an explicit `false` would permanently win
            // react-aria's own validity priority, hiding a real server error after Submit.
            isInvalid={isMissing || undefined}
            errorMessage={isMissing ? CHECKLIST_JUSTIFICATION_REQUIRED_MESSAGE : undefined}
            placeholder="Explain why this is justified..."
        />
    );
}

/** Full checklist - icon, label, personalized description, plus a justification input for warns.
 *  Memoized - re-running its rows' mount/unmount on every unrelated keystroke was visibly janky. */
export const FullChecklist = memo(function FullChecklist({
    className,
    style,
    results,
    justifications,
    onJustificationChange,
    isDisabled,
    readOnly
}: {
    results: RuleResult[];
    justifications: ChecklistJustifications;
    onJustificationChange?: (rule: RuleResult["rule"], justification: string) => void;
    isDisabled?: boolean;
    /** display-only, eg. the /suggestions/:id view page - shows the recorded text, no input */
    readOnly?: boolean;
} & Omit<BaseElementProps, "children">) {
    return (
        <ul className={classNames("flex flex-col gap-3", className)} style={style}>
            <AnimatePresence initial={false}>
                {sortByStatus(results).map((result) => {
                    const justification = justifications[result.rule] ?? "";
                    return (
                        <motion.li
                            key={result.rule}
                            className="overflow-hidden"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={ROW_TRANSITION}
                        >
                            <div
                                className={classNames(
                                    "rounded-lg border p-3",
                                    result.status === "pass" && "border-success/40",
                                    result.status === "warn" && "border-warning/40",
                                    result.status === "indeterminate" && "border-content3"
                                )}
                            >
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                    <RuleMark status={result.status} />
                                    <span>{result.label}</span>
                                    {result.tooltip && <RuleTooltip tooltip={result.tooltip} />}
                                </div>
                                <div className="mt-1 pl-6 text-xs text-foreground/60">{result.description}</div>
                                {result.status === "warn" && readOnly && (
                                    <div className="mt-2 pl-6 text-xs italic text-foreground/70">
                                        {justification || "No reason recorded."}
                                    </div>
                                )}
                                {result.status === "warn" && !readOnly && onJustificationChange && (
                                    <div className="mt-2 pl-6">
                                        <JustificationTextarea
                                            rule={result.rule}
                                            justification={justification}
                                            onJustificationChange={onJustificationChange}
                                            isDisabled={isDisabled}
                                        />
                                    </div>
                                )}
                            </div>
                        </motion.li>
                    );
                })}
            </AnimatePresence>
        </ul>
    );
});
