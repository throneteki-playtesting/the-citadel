import { FactionCardCount } from "common/models/projects";
import { NumberInput } from "@heroui/react";
import { DeepPartial } from "common/types";
import { useEffect, useMemo, useState } from "react";
import { Faction, factions } from "common/models/cards";
import { factionNames } from "common/utils";
import ThronesIcon from "../../components/thronesIcon";

const DEFAULT_COUNTS = Object.fromEntries(factions.map(f => [f, 0])) as FactionCardCount;

export default function CardCountEditor({ cardCount: initial, onChange }: CardCountEditorProps) {
    const [counts, setCounts] = useState<FactionCardCount>(DEFAULT_COUNTS);

    useEffect(() => {
        const cardCount = { ...DEFAULT_COUNTS, ...initial };
        setCounts(cardCount);
        if (!initial) {
            onChange(cardCount);
        }
    }, [initial, onChange]);

    const handleChange = (faction: Faction, value: number) => {
        const next = { ...counts, [faction]: value };
        setCounts(next);
        onChange(next);
    };

    const total = useMemo(
        () => factions.reduce((sum, f) => sum + counts[f], 0),
        [counts]
    );

    return (
        <>
            <span className="text-xl">Card Counts</span>
            <div className="text-sm">Each faction must have their total number of cards defined before card selection.</div>
            <div className="text-xs italic font-bold">Warning: This cannot be adjusted after initial cards are confirmed!</div>
            <div className="grid grid-cols-3 gap-1">
                {factions.map(faction => (
                    <NumberInput
                        key={faction}
                        name={`cardCount.${faction}`}
                        aria-label={factionNames[faction]}
                        classNames={{ input: "text-center text-lg" }}
                        startContent={<ThronesIcon name={faction} className="text-xl text-center" />}
                        minValue={0}
                        value={counts[faction]}
                        onValueChange={value => handleChange(faction, value)}
                    />
                ))}
            </div>
            <div className="text-lg font-bold bg-default-100 w-full text-center rounded-lg p-2">Total: {total}</div>
        </>
    );
};

type CardCountEditorProps = {
    cardCount?: DeepPartial<FactionCardCount>;
    onChange: (data: FactionCardCount) => void;
}