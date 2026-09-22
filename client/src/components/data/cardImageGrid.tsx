import classNames from "classnames";
import { Button, Input, Spinner } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faXmarkCircle } from "@fortawesome/free-solid-svg-icons";
import usePaginatedThronesDbCards from "../../hooks/usePaginatedThronesDbCards";
import LoadingCard from "../loadingCard";
import { BaseElementProps } from "../../types";

// Printed ThronesDB cards, searched/paged server-side (see thronesDbCardPoolService) - used for
// Comparable Cards and Combos With, both restricted to genuinely printed cards only.

/** A simple search-and-pick grid of card images - search is the only filter, picking is a direct click.
 *  The caller renders the current selection itself (see SelectedCardImages). */
export default function CardImageGrid({
    className,
    style,
    ariaLabel,
    placeholder,
    value,
    onChange,
    isDisabled
}: CardImageGridProps) {
    const { items, isLoading, isFetching, hasMore, handleLoadMore, search, setSearch } = usePaginatedThronesDbCards();

    const toggle = (code: string) => {
        if (isDisabled) {
            return;
        }
        onChange(value.includes(code) ? value.filter((v) => v !== code) : [...value, code]);
    };

    return (
        <div className={classNames("flex flex-col gap-2", className)} style={style}>
            <Input
                size="sm"
                aria-label={ariaLabel}
                placeholder={placeholder}
                value={search}
                onValueChange={setSearch}
                isDisabled={isDisabled}
                startContent={<FontAwesomeIcon icon={faMagnifyingGlass} className="text-foreground/40" />}
                endContent={
                    search ? (
                        <button type="button" aria-label="Clear search" onClick={() => setSearch("")}>
                            <FontAwesomeIcon icon={faXmarkCircle} className="text-default-400" />
                        </button>
                    ) : null
                }
            />
            {isLoading ? (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1">
                    {Array.from({ length: 12 }).map((_, index) => (
                        <LoadingCard key={index} />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <div className="p-6 text-center text-xs text-foreground/50">No cards match that search.</div>
            ) : (
                <>
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1">
                        {items.map((card) => {
                            const isSelected = value.includes(card.code!);
                            return (
                                <button
                                    key={card.code}
                                    type="button"
                                    aria-label={card.label}
                                    aria-pressed={isSelected}
                                    disabled={isDisabled}
                                    onClick={() => toggle(card.code!)}
                                    className={classNames(
                                        "block relative aspect-[240/333] h-auto max-w-full max-h-full rounded-xl overflow-hidden cursor-pointer transition-transform",
                                        isSelected ? "ring-4 ring-primary-500" : "hover:scale-[1.02]"
                                    )}
                                >
                                    <img src={card.imageUrl} alt={card.label} className="w-full h-full object-cover" />
                                </button>
                            );
                        })}
                    </div>
                    {hasMore && (
                        <div className="flex justify-center py-2">
                            {isFetching ? (
                                <Spinner size="sm" aria-label="Loading more" />
                            ) : (
                                <Button size="sm" variant="flat" onPress={handleLoadMore}>
                                    Load more
                                </Button>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

type CardImageGridProps = Omit<BaseElementProps, "children"> & {
    ariaLabel?: string;
    placeholder?: string;
    value: string[];
    onChange: (codes: string[]) => void;
    isDisabled?: boolean;
};
