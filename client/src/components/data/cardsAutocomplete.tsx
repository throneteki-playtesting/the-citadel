import { Autocomplete, AutocompleteItem, AutocompleteProps } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";
import { Filterable, Sort } from "common/types";
import { Key, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useGetCardsQuery } from "../../api";
import { useFilter } from "../../api/hooks";
import { factionNames, fuzzyMatch } from "common/utils";

const CardsAutocomplete = ({ filter: initialFilter, orderBy, children = (card) => (<div>{card.name}</div>), isLoading: isForcedLoading = false, mapKey = (card) => `${card.project}|${card.number}|${card.version}`, selectedKey, onSelectionChange = () => true, ...autocompleteProps }: CardsAutocompleteProps) => {
    const filter = useFilter(initialFilter);
    const { data, isLoading } = useGetCardsQuery({ filter, orderBy });

    const [selected, setSelected] = useState<IPlaytestCard | undefined>();
    const [input, setInput] = useState<string>("");

    const handleSelect = useCallback((key: Key | null) => {
        if (data) {
            const selectedCard = key ? data?.items.find((card) => key === mapKey(card)) : undefined;
            if (selectedCard !== selected) {
                setSelected(selectedCard);
                setInput(selectedCard?.name ?? "");
                onSelectionChange(selectedCard);
            }
        }
    }, [data, mapKey, onSelectionChange, selected]);

    useEffect(() => {
        handleSelect(selectedKey ?? null);
    }, [handleSelect, selectedKey]);

    const items = useMemo(() => {
        const cards = data?.items ?? [];
        if (input.length === 0) {
            return cards;
        }

        return cards.filter((card) => fuzzyMatch(input, card.name, card.version, card.faction, factionNames[card.faction]));
    }, [data?.items, input]);

    return (
        <Autocomplete
            aria-label="Card"
            isLoading={isLoading || isForcedLoading}
            items={items}
            onInputChange={setInput}
            selectedKey={selected ? mapKey(selected) as (string | undefined) : null}
            inputValue={input}
            onSelectionChange={handleSelect}
            {...autocompleteProps}
        >
            {(card) => (
                <AutocompleteItem key={mapKey(card)} textValue={card.name}>
                    {children(card)}
                </AutocompleteItem>
            )}
        </Autocomplete>
    );
};

type CardsAutocompleteProps = Omit<AutocompleteProps<IPlaytestCard>, "isLoading" | "children" | "selectedKey" | "onSelectionChange"> & { filter?: Filterable<IPlaytestCard>, orderBy?: Sort<IPlaytestCard>, children?: (card: IPlaytestCard) => ReactNode, isLoading?: boolean, mapKey?: (card: IPlaytestCard) => Key, selectedKey?: Key, onSelectionChange?: (card?: IPlaytestCard) => void };

export default CardsAutocomplete;