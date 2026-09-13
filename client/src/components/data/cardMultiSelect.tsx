import { ILabeledCard } from "common/models/cards";
import usePaginatedThronesDbCards from "../../hooks/usePaginatedThronesDbCards";
import SearchableMultiSelect from "./searchableMultiSelect";
import CardRow from "../cardRow";
import { BaseElementProps } from "../../types";

// Printed ThronesDB cards, searched/paged server-side (see thronesDbCardPoolService) - used for
// Comparable Cards and Combos With, both restricted to genuinely printed cards only.

// A pure search-and-pick control (`hideChipsInInput`) - the caller renders the current selection
// itself (see SelectedCardChips). `keepSearchOnSelect` leaves the typed term in place after a pick.
export default function CardMultiSelect({
    className,
    style,
    label,
    ariaLabel,
    placeholder,
    value,
    onChange,
    isDisabled
}: CardMultiSelectProps) {
    const { items, isLoading, hasMore, handleLoadMore, search, setSearch, matches } = usePaginatedThronesDbCards();

    return (
        <SearchableMultiSelect<ILabeledCard>
            className={className}
            style={style}
            label={label}
            ariaLabel={ariaLabel}
            placeholder={placeholder}
            items={items}
            getKey={(card) => card.code!}
            matches={matches}
            isLoading={isLoading}
            isDisabled={isDisabled}
            search={search}
            onSearchChange={setSearch}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
            hideChipsInInput
            keepSearchOnSelect
            selectedKeys={value}
            onSelectionChange={(keys) => {
                if (keys === "all") {
                    return;
                }
                onChange([...keys].map(String));
            }}
            renderItem={(card) => (
                <CardRow faction={card.faction} type={card.type} name={card.label} imageUrl={card.imageUrl} />
            )}
        />
    );
}

type CardMultiSelectProps = Omit<BaseElementProps, "children"> & {
    label?: string;
    ariaLabel?: string;
    placeholder?: string;
    value: string[];
    onChange: (codes: string[]) => void;
    isDisabled?: boolean;
};
