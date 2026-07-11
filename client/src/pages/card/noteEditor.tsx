import { NoteDetails, NoteType, noteTypes } from "common/models/cards";
import { Select, SelectItem, Textarea } from "@heroui/react";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { DeepPartial } from "common/types";
import { noteTypeIcon } from "../../utils";

const NoteEditor = ({ note: initial, onChange }: NoteEditorProps) => {
    const [type, setType] = useState<NoteType>();
    const [text, setText] = useState<string>();

    useEffect(() => {
        setType(initial?.type);
        setText(initial?.text);
    }, [initial?.type, initial?.text]);

    const getHeader = (type: NoteType) => {
        return (
            <div className="flex gap-1 text-medium">
                <FontAwesomeIcon icon={noteTypeIcon[type]}/>
                <span className="capitalize leading-tight font-bold">{type}</span>
            </div>
        );
    };

    const getDescription = (type: NoteType) => {
        switch (type) {
            case "updated":
                return (
                    <div className="flex flex-col gap-1 p-1">
                        <span className="text-sm">The card's book reference and overall direction remain intact, but specific characteristics of that card have been tweaked.</span>
                        <span className="text-xs italic">Example: Adjusting a character's STR from 2 to 4, their gold cost from 4 to 5, and adding "Renown." to their text box.</span>
                    </div>
                );
            case "reworked":
                return (
                    <div className="flex flex-col gap-1 p-1">
                        <span className="text-sm">The card's book reference is the same, but the way the card interacts with the game has changed fundamentally.</span>
                        <span className="text-xs italic">Example: A Daenerys Targaryen card that previously focused on Burn effects now provides passive STR buffs to Dragons; the character is the same, but their "direction" has shifted.</span>
                    </div>
                );
            case "replaced":
                return (
                    <div className="flex flex-col gap-1 p-1">
                        <span className="text-sm">The previous card design and reference has been scrapped, and a new card has taken its place. This usually signals that the previous design was redundant or unfixable.</span>
                        <span className="text-xs italic">Example: Removing a Winterfell card entirely to make room for a new White Harbor card.</span>
                    </div>
                );
            case "wording":
                return (
                    <div className="flex flex-col gap-1 p-1">
                        <span className="text-sm">The card's gameplay and direction are unchanged - only its final text or traits have been refined for clarity, rules accuracy or print.</span>
                        <span className="text-xs italic">Example: Rewording a trigger condition to match official templating ahead of release.</span>
                    </div>
                );
        }
    };

    return (
        <div className="px-2 flex flex-col gap-2 w-full h-full">
            <span className="text-xl">Change Notes</span>
            <div className="w-full">
                <Select
                    name="note.type"
                    label="Type"
                    isMultiline
                    items={noteTypes.map((type) => ({ type })) ?? []}
                    onSelectionChange={(keys) => {
                        const newType = keys.currentKey as NoteType;
                        setType(newType);
                        onChange({ type: newType, text });
                    }}
                    selectedKeys={type ? [type] : []}
                    renderValue={(items) => items.map(({ key }) => key && (
                        <div className="flex gap-1">
                            <FontAwesomeIcon icon={noteTypeIcon[type as NoteType]}/>
                            <span className="capitalize leading-tight">{type}</span>
                        </div>
                    ))}
                >
                    {({ type }) => (
                        <SelectItem key={type} textValue={type}>
                            {getHeader(type)}
                            {getDescription(type)}
                        </SelectItem>
                    )}
                </Select>

            </div>
            <Textarea
                name="note.text"
                className="flex-grow"
                classNames={{ inputWrapper: "flex-grow" }}
                label="Details"
                onValueChange={(value) => {
                    setText(value);
                    onChange({ type, text: value });
                }}
                value={text}
                placeholder="Include what has changed, and the reasoning behind those changes..."
            />
        </div>
    );
};

type NoteEditorProps = { note?: DeepPartial<NoteDetails>, onChange: (data: DeepPartial<NoteDetails>) => void }

export default NoteEditor;