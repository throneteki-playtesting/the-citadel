import { Button, ButtonGroup, Input, Select, SelectItem } from "@heroui/react";
import ThronesIcon from "../../thronesIcon";
import { factionNames, typeNames } from "common/utils";
import { Cost as CostType, Strength as StrengthType, factions, Faction as FactionType, types, Type as TypeType, Icons as IconsType, PlotStats as PlotStatsType, PlotValue as PlotValueType } from "common/models/cards";
import { Dispatch, SetStateAction } from "react";
import classNames from "classnames";
import { BaseElementProps } from "../../../types";
import ComboBox from "../../combobox";
import { DeepPartial } from "common/types";
import { useFieldName } from "../fieldPrefixContext";

type CustomSetterProps<T> = Omit<BaseElementProps, "children"> & { value?: T, setValue: Dispatch<SetStateAction<T | undefined>>, isDisabled?: boolean };

export const FactionSelect = ({ className, style, value: faction, setValue: setFaction, isDisabled }: CustomSetterProps<FactionType>) => {
    const name = useFieldName("faction");
    return (
        <Select name={name} className={className} style={style} label="Faction" startContent={faction && <ThronesIcon name={faction}/>} selectedKeys={faction ? [faction] : []} onChange={(e) => setFaction(e.target.value as FactionType)} isDisabled={isDisabled}>
            {factions.map((faction) =>
                <SelectItem key={faction} startContent={<ThronesIcon name={faction}/>}>
                    {factionNames[faction]}
                </SelectItem>)}
        </Select>
    );
};

export const TypeSelect = ({ className, style, value: type, setValue: setType, isDisabled }: CustomSetterProps<TypeType>) => {
    const name = useFieldName("type");
    return (
        <Select name={name} className={className} style={style} label="Type" startContent={type && <ThronesIcon name={type}/>} selectedKeys = {type ? [type] : []} onChange={(e) => setType(e.target.value as TypeType)} isDisabled={isDisabled}>
            {types.map((type) =>
                <SelectItem key={type} startContent={<ThronesIcon name={type}/>}>
                    {typeNames[type]}
                </SelectItem>
            )}
        </Select>
    );
};

export const UniqueButton = ({ className, style, value: unique, setValue: setUnique, isDisabled }: CustomSetterProps<boolean>) => {
    return (
        <Button className={classNames("w-14 h-14", { "text-default-50": !unique }, className)} style={style} isIconOnly={true} size="lg" radius="none" onPress={() => setUnique(!unique)} isDisabled={isDisabled}>
            <ThronesIcon name="unique"/>
        </Button>
    );
};

export const LoyalButton = ({ className, style, value: loyal, setValue: setLoyal, isDisabled }: CustomSetterProps<boolean>) => {
    return (
        <Button className={classNames("w-14 h-14", { "text-default-50": !loyal }, className)} style={style} size="lg" onPress={() => setLoyal(!loyal)} isDisabled={isDisabled}>
            Loyal
        </Button>
    );
};

export const CostInput = ({ className, style, value: cost, setValue, isDisabled }: CustomSetterProps<CostType>) => {
    const name = useFieldName("cost");
    const setCost = (value: string) => {
        let cost: CostType | undefined = undefined;
        if (value?.toUpperCase().startsWith("X")) {
            cost = "X";
        } else if (value?.startsWith("-")) {
            cost = "-";
        } else {
            const asNumber = parseInt(value);
            if (!isNaN(asNumber)) {
                cost = asNumber;
            }
        }
        setValue(cost);
    };
    return (
        <Input name={name} className={className} style={style} label="Cost" value={cost?.toString() ?? ""} onValueChange={setCost} isDisabled={isDisabled}>
            {cost?.toString()}
        </Input>
    );
};

export const ChallengeIconButtons = ({ className, style, value: challengeIcons = {}, setValue: setChallengeIcons, isDisabled }: CustomSetterProps<DeepPartial<IconsType>>) => {
    const toggleIcon = (icon: keyof IconsType) => {
        const newChallengeIcons = { ...challengeIcons };
        newChallengeIcons[icon] = !(challengeIcons[icon] ?? false);
        setChallengeIcons(newChallengeIcons);
    };
    return (
        <ButtonGroup className={className} style={style} size="lg" isDisabled={isDisabled}>
            <Button className={classNames("w-14 h-14", { "text-default-50": !challengeIcons?.military }, className)} isIconOnly={true} onPress={() => toggleIcon("military")}>
                <ThronesIcon name="military" />
            </Button>
            <Button className={classNames("w-14 h-14", { "text-default-50": !challengeIcons?.intrigue }, className)} isIconOnly={true} onPress={() => toggleIcon("intrigue")}>
                <ThronesIcon name="intrigue" />
            </Button>
            <Button className={classNames("w-14 h-14", { "text-default-50": !challengeIcons?.power }, className)} isIconOnly={true} onPress={() => toggleIcon("power")}>
                <ThronesIcon name="power" />
            </Button>
        </ButtonGroup>
    );
};

export const StrengthInput = ({ className, style, value: strength, setValue, isDisabled }: CustomSetterProps<StrengthType>) => {
    const name = useFieldName("strength");
    const setStrength = (value: string) => {
        let strength: StrengthType | undefined = undefined;
        if (value?.toUpperCase().startsWith("X")) {
            strength = "X";
        } else {
            const asNumber = parseInt(value);
            if (!isNaN(asNumber)) {
                strength = asNumber;
            }
        }
        setValue(strength);
    };

    return (
        <Input name={name} className={className} style={style} label="Strength" value={strength?.toString() ?? ""} onValueChange={setStrength} isDisabled={isDisabled}>
            {strength?.toString()}
        </Input>
    );
};

export const TraitsInput = ({ className, style, value: traits, setValue: setTraits, isDisabled }: CustomSetterProps<string[]>) => {
    const name = useFieldName("traits");
    const setValue = (items: string[]) => {
        // Removes any trailing dots
        const cleanedItems = items.map((item) => item.replace(/\.+$/, ""));
        setTraits(cleanedItems);
    };
    return (
        <ComboBox name={name} className={className} style={style} label="Traits" values={traits} placeholder="Type and press enter" onChange={setValue} isDisabled={isDisabled} chip={{ color: "default", variant: "flat", className: "rounded-sm p-0 pr-0.5" }} addKeys={["Enter", "."]}/>
    );
};

export const FlavorInput = ({ className, style, value: flavor, setValue: setFlavor, isDisabled }: CustomSetterProps<string>) => {
    const name = useFieldName("flavor");
    return (
        <Input name={name} className={className} style={style} label="Flavor" value={flavor ?? ""} onValueChange={setFlavor} isDisabled={isDisabled}>
            {flavor}
        </Input>
    );
};

export const PlotStatInputs = ({ className, style, value: plotStats, setValue: setPlotStats, isDisabled }: Omit<CustomSetterProps<DeepPartial<PlotStatsType>>, "errorMessage"> & { errorMessages?: { [K in keyof PlotStatsType]?: string } }) => {
    const incomeName = useFieldName("plotStats.income");
    const initiativeName = useFieldName("plotStats.initiative");
    const claimName = useFieldName("plotStats.claim");
    const reserveName = useFieldName("plotStats.reserve");
    const setValue = (type: keyof PlotStatsType, value: string) => {
        let statValue: PlotValueType | undefined = undefined;
        if (value?.toUpperCase().startsWith("X")) {
            statValue = "X";
        } else {
            const asNumber = parseInt(value);
            if (!isNaN(asNumber)) {
                statValue = asNumber;
            }
        }
        setPlotStats({ ...plotStats, [type]: statValue });
    };
    return (
        <div className={classNames("grid grid-cols-2 gap-2", className)} style={style}>
            <Input name={incomeName} className={className} style={style} label="Income" value={plotStats?.income?.toString() ?? ""} onValueChange={(value) => setValue("income", value)} isDisabled={isDisabled}>
                {plotStats?.income}
            </Input>
            <Input name={initiativeName} className={className} style={style} label="Initiative" value={plotStats?.initiative?.toString() ?? ""} onValueChange={(value) => setValue("initiative", value)} isDisabled={isDisabled}>
                {plotStats?.initiative}
            </Input>
            <Input name={claimName} className={className} style={style} label="Claim" value={plotStats?.claim?.toString() ?? ""} onValueChange={(value) => setValue("claim", value)} isDisabled={isDisabled}>
                {plotStats?.claim}
            </Input>
            <Input name={reserveName} className={className} style={style} label="Reserve" value={plotStats?.reserve?.toString() ?? ""} onValueChange={(value) => setValue("reserve", value)} isDisabled={isDisabled}>
                {plotStats?.reserve}
            </Input>
        </div>
    );
};