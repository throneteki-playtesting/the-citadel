import { ReactElement, useState } from "react";
import { Faction, ICardSuggestion, Type } from "common/models/cards";
import { useGetSuggestionsQuery } from "../../api";
import { useFilter } from "../../api/hooks";
import { User } from "common/models/user";
import { Sortable } from "common/types";
import CardGrid from "../../components/cardGrid";
import { BaseElementProps } from "../../types";
import OrderBySelector from "../../components/data/orderBy";
import FactionFilter from "../../components/data/factionFilter";
import TypeFilter from "../../components/data/typeFilter";
import UserFilter from "../../components/data/userFilter";
import TagFilter from "../../components/data/tagFilter";
import { Pagination, Select, SelectItem } from "@heroui/react";
import classNames from "classnames";

const SortOptions = {
    card: {
        name: "Name",
        faction: "Faction",
        type: "Card Type",
        cost: "Cost"
    },
    created: "Created Date",
    updated: "Updated Date"
};
const SuggestionsGrid = ({ className, style, size, filter: initialFilter, hideFilters, children: renderMapFunc }: SuggestionsGridProps) => {
    const [factions, setFactions] = useState(initialFilter?.faction ?? []);
    const [types, setTypes] = useState(initialFilter?.type ?? []);
    const [users, setUsers] = useState(initialFilter?.user ?? []);
    const [tags, setTags] = useState(initialFilter?.tags ?? []);
    const filter = useFilter<ICardSuggestion>({ archivedReason: undefined, card: { faction: factions, type: types }, user: { discordId: users.map((user) => user.discordId) }, tags });
    const [orderBy, setOrderBy] = useState<Sortable<ICardSuggestion> | undefined>();
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState<number>(24);

    const { data: suggestionsData, isLoading, isFetching } = useGetSuggestionsQuery({ filter, orderBy, page, perPage });

    return (
        <div className={classNames("w-full flex flex-col gap-2", className)} style={style}>
            <div className="flex flex-wrap gap-2">
                {!hideFilters?.faction && <FactionFilter className="flex-1" factions={factions} setFactions={setFactions}/>}
                {!hideFilters?.type && <TypeFilter className="flex-1" types={types} setTypes={setTypes}/>}
                {!hideFilters?.user && <UserFilter className="sm:flex-1" label="Suggested By" users={users} setUsers={setUsers}/>}
                {!hideFilters?.tags && <TagFilter className="sm:flex-1" label="Tags" tags={tags} setTags={setTags}/>}
            </div>
            <CardGrid className="shrink" cards={suggestionsData?.items} isLoading={isLoading || isFetching} size={size}>
                {renderMapFunc}
            </CardGrid>
            <div className="flex flex-col sm:flex-row sm:items-center">
                <div className="w-full flex gap-2">
                    <Select label="Per Page" labelPlacement="outside-left" className="w-34" selectedKeys={[perPage.toString()]} onSelectionChange={(keys) => setPerPage(keys.currentKey ? parseInt(keys.currentKey) : 12)}>
                        {[12, 24, 36, 48].map((pp) => <SelectItem key={pp} textValue={pp.toString()}>{pp}</SelectItem>)}
                    </Select>
                    <Pagination className="grow" page={page} onChange={setPage} total={Math.ceil((suggestionsData?.total ?? 0) / perPage)}/>
                </div>
                <OrderBySelector className="sm:w-lg" variant="underlined" labelPlacement="outside-left" options={SortOptions} orderBy={orderBy} setOrderBy={setOrderBy}/>
            </div>
        </div>
    );
};

type SuggestionsGridProps = Omit<BaseElementProps, "children"> & {
    size?: "sm" | "md" | "lg",
    filter?: { faction?: Faction[], type?: Type[], user?: User[], tags?: string[] },
    hideFilters?: { faction?: boolean, type?: boolean, user?: boolean, tags?: boolean },
    children: (card: ICardSuggestion, index: number) => ReactElement
}

export default SuggestionsGrid;