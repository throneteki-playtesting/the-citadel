import { ReactNode, useEffect, useMemo, useState } from "react";
import { IPlaytestCard } from "common/models/cards";
import CardGrid from "../../components/cardGrid";
import { BaseElementProps } from "../../types";
import { Input, Pagination, Select, SelectItem, Spinner } from "@heroui/react";
import classNames from "classnames";
import { useGetCardsQuery } from "../../api";
import { Filter, Sort } from "common/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faXmarkCircle } from "@fortawesome/free-solid-svg-icons";

export default function PlaytestCardGrid({ className, style, size, filter: initialFilter, orderBy: initialOrderBy, search: initialSearch, pageSize = 10, children: renderMapFunc, menuContent }: PlaytestCardGridProps) {
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState<number>(pageSize);

    useEffect(() => {
        setSearch(initialSearch ?? "");
    }, [initialSearch]);

    // Reset to page 1 when search changes
    const handleSearch = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    const filter = useMemo(() => {
        const baseFilter = initialFilter;

        if (!search) {
            return baseFilter;
        }

        const searchRegex = `(?i)${search}`;

        // TODO: Pull this into a customisable "searchProperties" prop, ensuring deep properties work (eg. note.text)
        return [
            { ...baseFilter, name: { $regex: searchRegex } },
            { ...baseFilter, text: { $regex: searchRegex } },
            { ...baseFilter, faction: { $regex: searchRegex } },
            { ...baseFilter, type: { $regex: searchRegex } }
        ];
    }, [initialFilter, search]);

    const { data: cardsData, isLoading, isFetching } = useGetCardsQuery({ filter, orderBy: initialOrderBy, page, perPage });

    return (
        <div className={classNames("w-full flex flex-col gap-2", className)} style={style}>
            <div className="flex gap-2">
                <Input
                    placeholder="Search..."
                    value={search}
                    onValueChange={handleSearch}
                    startContent={<FontAwesomeIcon icon={faMagnifyingGlass}/>}
                    endContent={
                        isFetching ? (
                            <Spinner size="sm" aria-label="Loading" />
                        ) : search ? (
                            <button onClick={() => handleSearch("")}>
                                <FontAwesomeIcon icon={faXmarkCircle} className="text-default-400" />
                            </button>
                        ) : null
                    }
                    className="max-w-98"
                />
                {menuContent}
            </div>
            <CardGrid cards={cardsData?.items} isLoading={isLoading} size={size}>
                {renderMapFunc}
            </CardGrid>
            <div className="flex items-center gap-2">
                <Select label="Per Page" labelPlacement="outside-left" className="w-34" selectedKeys={[perPage.toString()]} onSelectionChange={(keys) => setPerPage(keys.currentKey ? parseInt(keys.currentKey) : 24)}>
                    {[10, 15, 20, 25].map((pp) => <SelectItem key={pp} textValue={pp.toString()}>{pp}</SelectItem>)}
                </Select>
                <Pagination className="grow" page={page} onChange={setPage} total={Math.ceil((cardsData?.total ?? 0) / perPage)} />
            </div>
        </div>
    );
}

type PlaytestCardGridProps = Omit<BaseElementProps, "children"> & {
    size?: "sm" | "md" | "lg";
    filter?: Filter<IPlaytestCard>;
    orderBy?: Sort<IPlaytestCard>;
    search?: string;
    pageSize?: number;
    menuContent?: ReactNode;
    children: (card: IPlaytestCard, index: number) => ReactNode;
}