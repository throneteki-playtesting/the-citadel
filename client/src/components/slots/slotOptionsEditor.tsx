import {
    Button,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownSection,
    DropdownTrigger,
    NumberInput,
    Select,
    SelectItem,
    Switch
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { ReactNode } from "react";
import { useFieldValidation } from "../../hooks/useFieldValidation";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { NOTICE_TRANSITION } from "../../constants";
import { groupBy, upperFirst } from "lodash-es";
import { challengeIcons, Faction, Type, types } from "common/models/cards";
import {
    conditionBlocker,
    conditionLabels,
    conditionRequirement,
    ConditionStat,
    conditionStats,
    RangeStat,
    SlotCondition,
    withoutBlockedConditions
} from "common/models/slotConditions";
import { ISlotOptions } from "common/models/slots";
import { keywordNames } from "common/designGuidelines/deriveFields";
import { factionNames, typeNames } from "common/utils";
import { TraitsInput } from "../cardEditor/components/editorComponents";
import { FieldPrefixContext } from "../cardEditor/fieldPrefixContext";
import { BooleanToggle } from "../data/filters";
import RichTextArea from "../richTextArea";
import ThronesIcon from "../thronesIcon";
import { TouchTooltip } from "../touchTooltip";

// Pressing an icon steps it on to the next, wrapping back round to Allowed
const iconStates = [
    { setting: undefined, label: "Allowed", color: "default" },
    { setting: false, label: "Forbidden", color: "danger" },
    { setting: true, label: "Required", color: "success" }
] as const;
const iconStateOf = (setting?: boolean) => iconStates.find((state) => state.setting === setting) ?? iconStates[0];

// A slot's conditions and the options every slot has - shared by the slot's shortcut and the project editor
export default function SlotOptionsEditor({ value, faction, onChange }: SlotOptionsEditorProps) {
    const conditions = value.conditions ?? [];
    const usedStats = new Set(conditions.map((condition) => condition.stat));

    const setConditions = (next: SlotCondition[]) =>
        onChange({ ...value, conditions: next.length > 0 ? withoutBlockedConditions(next, faction) : undefined });
    const replace = (index: number, condition: SlotCondition) =>
        setConditions(conditions.map((existing, at) => (at === index ? condition : existing)));
    const add = (stat: ConditionStat) =>
        setConditions(
            [...conditions, emptyCondition(stat)].sort(
                (a, b) => conditionStats.indexOf(a.stat) - conditionStats.indexOf(b.stat)
            )
        );

    const addable = conditionStats.filter((stat) => !usedStats.has(stat));
    // Unavailable stats sink below the rest, gathered under what each needs first - eg. "Plots only"
    const blocked = addable.filter((stat) => conditionBlocker(stat, conditions, faction));
    const available = addable.filter((stat) => !blocked.includes(stat));
    const blockedGroups = Object.entries(groupBy(blocked, (stat) => conditionRequirement(stat, faction)));

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col">
                <ConditionRow
                    label="Faction"
                    isInline
                    action={
                        <TouchTooltip content="Set by the slot">
                            <span className="grid size-8 place-items-center text-foreground/40 cursor-help">
                                <FontAwesomeIcon icon={faLock} />
                            </span>
                        </TouchTooltip>
                    }
                >
                    <span className="flex items-center gap-2 text-small">
                        <ThronesIcon name={faction} />
                        {factionNames[faction]}
                    </span>
                </ConditionRow>
                <AnimatePresence initial={false}>
                    {conditions.map((condition, index) => (
                        <motion.div
                            key={condition.stat}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={NOTICE_TRANSITION}
                            className="overflow-hidden"
                        >
                            <ConditionRow
                                label={conditionLabels[condition.stat]}
                                action={
                                    <Button
                                        isIconOnly
                                        size="sm"
                                        variant="light"
                                        color="danger"
                                        aria-label={`Remove the ${conditionLabels[condition.stat]} condition`}
                                        onPress={() => setConditions(conditions.filter((_, at) => at !== index))}
                                    >
                                        <FontAwesomeIcon icon={faTrash} />
                                    </Button>
                                }
                            >
                                <FieldPrefixContext.Provider value={`conditions.${index}`}>
                                    <ConditionInputs
                                        condition={condition}
                                        path={`conditions.${index}`}
                                        onChange={(next) => replace(index, next)}
                                    />
                                </FieldPrefixContext.Provider>
                            </ConditionRow>
                        </motion.div>
                    ))}
                </AnimatePresence>
                {addable.length > 0 && (
                    <Dropdown>
                        <DropdownTrigger>
                            <Button
                                size="sm"
                                variant="flat"
                                startContent={<FontAwesomeIcon icon={faPlus} />}
                                className="mt-0.5 w-full sm:w-auto sm:self-start"
                            >
                                Add condition
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label="Add condition"
                            disabledKeys={blocked}
                            onAction={(stat) => add(stat as ConditionStat)}
                        >
                            {[
                                ...(available.length > 0
                                    ? [
                                          <DropdownSection key="available" showDivider={blockedGroups.length > 0}>
                                              {available.map(conditionItem)}
                                          </DropdownSection>
                                      ]
                                    : []),
                                ...blockedGroups.map(([requirement, stats]) => (
                                    <DropdownSection key={requirement} title={requirement}>
                                        {stats.map(conditionItem)}
                                    </DropdownSection>
                                ))
                            ]}
                        </DropdownMenu>
                    </Dropdown>
                )}
            </div>
            <Switch
                color="warning"
                isSelected={!!value.important}
                onValueChange={(important) => onChange({ ...value, important: important || undefined })}
            >
                <div className="flex flex-col">
                    <span className="text-small font-semibold">Important addition</span>
                    <span className="text-tiny text-foreground/50">
                        Part of what this project has to deliver. Its name and anything referencing it should hold
                        through development - changing either needs additional approval.
                    </span>
                </div>
            </Switch>
            <RichTextArea
                name="notes"
                label="Notes"
                features={[]}
                value={value.notes}
                onValueChange={(notes) => onChange({ ...value, notes })}
            />
        </div>
    );
}

// One line from sm up - label, controls, action - stacked on a phone. Its gap is inside it, so it folds away with it
function ConditionRow({ label, action, isInline, children }: ConditionRowProps) {
    return (
        <div className="pb-1.5">
            <div
                className={classNames(
                    "flex flex-wrap items-center gap-x-3 gap-y-1.5",
                    "rounded-medium border border-content3 px-2 py-1.5"
                )}
            >
                <span className="text-small font-semibold leading-tight sm:w-20 sm:shrink-0">{label}</span>
                <div
                    className={classNames(
                        "min-w-0 sm:order-2 sm:w-auto sm:flex-1",
                        isInline ? "order-2" : "order-3 w-full"
                    )}
                >
                    {children}
                </div>
                <div className="order-2 ml-auto sm:order-3 sm:ml-0">{action}</div>
            </div>
        </div>
    );
}

function ConditionInputs({ condition, path, onChange }: ConditionInputsProps) {
    switch (condition.stat) {
        case "type":
            return (
                <Select
                    size="sm"
                    name={`${path}.types`}
                    aria-label="Types"
                    placeholder="Choose one or more types"
                    selectionMode="multiple"
                    selectedKeys={condition.types}
                    onSelectionChange={(keys) => onChange({ ...condition, types: [...keys] as Type[] })}
                >
                    {types.map((type) => (
                        <SelectItem key={type} startContent={<ThronesIcon name={type} />}>
                            {typeNames[type]}
                        </SelectItem>
                    ))}
                </Select>
            );
        case "unique":
        case "loyal":
            return (
                <BooleanToggle
                    trueLabel={condition.stat === "unique" ? "Unique" : "Loyal"}
                    falseLabel={condition.stat === "unique" ? "Not unique" : "Not loyal"}
                    value={condition.value}
                    onChange={(value) => value !== undefined && onChange({ ...condition, value })}
                />
            );
        case "icons":
            return <IconConditionInputs condition={condition} path={path} onChange={onChange} />;
        case "traits":
            return (
                <TraitsInput
                    label={null}
                    size="sm"
                    placeholder="Any of these traits"
                    value={condition.traits}
                    setValue={(traits) => onChange({ ...condition, traits: Array.isArray(traits) ? traits : [] })}
                />
            );
        case "keywords":
            return (
                <Select
                    size="sm"
                    name={`${path}.keywords`}
                    aria-label="Keywords"
                    placeholder="Any of these keywords"
                    selectionMode="multiple"
                    selectedKeys={condition.keywords}
                    onSelectionChange={(keys) => onChange({ ...condition, keywords: [...keys] as string[] })}
                >
                    {keywordNames.map((keyword) => (
                        <SelectItem key={keyword}>{keyword}</SelectItem>
                    ))}
                </Select>
            );
        default:
            return <RangeConditionInputs condition={condition} path={path} onChange={onChange} />;
    }
}

// The range's own error (neither bound given) belongs to neither input, so both show it and either edit clears it
function RangeConditionInputs({ condition, path, onChange }: ConditionInputsProps<RangeCondition>) {
    const { isInvalid, errorMessage, commit } = useFieldValidation(path, condition);
    return (
        <div className="flex flex-col gap-1">
            <div className="grid grid-cols-2 gap-2">
                {(["min", "max"] as const).map((bound) => (
                    <NumberInput
                        key={bound}
                        size="sm"
                        name={`${path}.${bound}`}
                        label={bound === "min" ? "Min" : "Max"}
                        minValue={0}
                        isInvalid={isInvalid || undefined}
                        value={condition[bound] ?? NaN}
                        onValueChange={(amount) => {
                            commit();
                            onChange({ ...condition, [bound]: Number.isNaN(amount) ? undefined : amount });
                        }}
                    />
                ))}
            </div>
            <ConditionError message={errorMessage} />
        </div>
    );
}

function IconConditionInputs({ condition, path, onChange }: ConditionInputsProps<IconsCondition>) {
    const { errorMessage, commit } = useFieldValidation(`${path}.icons`, condition.icons);
    return (
        <div className="flex flex-col gap-1">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                {challengeIcons.map((icon) => {
                    const state = iconStateOf(condition.icons[icon]);
                    const next = iconStates[(iconStates.indexOf(state) + 1) % iconStates.length];
                    return (
                        <Button
                            key={icon}
                            size="sm"
                            variant="flat"
                            color={state.color}
                            aria-label={`${upperFirst(icon)}: ${state.label}, press for ${next.label}`}
                            startContent={<ThronesIcon name={icon} className="shrink-0 text-sm" />}
                            className="min-w-0 justify-start gap-1.5 px-2 text-xs"
                            onPress={() => {
                                commit();
                                const icons = { ...condition.icons, [icon]: next.setting };
                                if (next.setting === undefined) {
                                    delete icons[icon];
                                }
                                onChange({ ...condition, icons });
                            }}
                        >
                            {state.label}
                        </Button>
                    );
                })}
            </div>
            <ConditionError message={errorMessage} />
        </div>
    );
}

function ConditionError({ message }: { message?: string }) {
    return message ? <span className="text-tiny text-danger">{message}</span> : null;
}

function conditionItem(stat: ConditionStat) {
    return <DropdownItem key={stat}>{conditionLabels[stat]}</DropdownItem>;
}

function emptyCondition(stat: ConditionStat): SlotCondition {
    switch (stat) {
        case "type":
            return { stat, types: [] };
        case "unique":
        case "loyal":
            return { stat, value: true };
        case "icons":
            return { stat, icons: {} };
        case "traits":
            return { stat, traits: [] };
        case "keywords":
            return { stat, keywords: [] };
        default:
            return { stat: stat as RangeStat };
    }
}

type ConditionRowProps = {
    label: string;
    action: ReactNode;
    /** Keeps the controls on the label's line even on a phone, for a row with almost nothing in it */
    isInline?: boolean;
    children: ReactNode;
};

type SlotOptionsEditorProps = {
    value: ISlotOptions;
    /** Neutral slots can't ask for loyalty */
    faction: Faction;
    onChange: (value: ISlotOptions) => void;
};

type RangeCondition = Extract<SlotCondition, { stat: RangeStat }>;
type IconsCondition = Extract<SlotCondition, { stat: "icons" }>;

type ConditionInputsProps<C extends SlotCondition = SlotCondition> = {
    condition: C;
    /** The condition's schema path, so validation errors land on its own inputs */
    path: string;
    onChange: (condition: C) => void;
};
