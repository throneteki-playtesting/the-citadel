import { faArrowUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { SortDirection } from "common/types";

export type ColumnSort = { key: string; dir: SortDirection };

const SortableColumnHeader = ({ label, sortKey, sort, onChange }: SortableColumnHeaderProps) => {
    const dir = sort?.key === sortKey ? sort.dir : undefined;

    const handleClick = () => {
        if (!dir) {
            onChange({ key: sortKey, dir: "asc" });
        } else if (dir === "asc") {
            onChange({ key: sortKey, dir: "desc" });
        } else {
            onChange(undefined);
        }
    };

    return (
        <button type="button" onClick={handleClick} className="flex items-center gap-1 group">
            <span>{label}</span>
            <FontAwesomeIcon
                icon={faArrowUp}
                className={classNames("transition-all duration-200 ease-out", {
                    "rotate-0 opacity-0 scale-50 group-hover:opacity-40 group-hover:scale-100": !dir,
                    "rotate-0 opacity-100 scale-100": dir === "asc",
                    "rotate-180 opacity-100 scale-100": dir === "desc"
                })}
            />
        </button>
    );
};

type SortableColumnHeaderProps = {
    label: string;
    sortKey: string;
    sort?: ColumnSort;
    onChange: (next?: ColumnSort) => void;
};

export default SortableColumnHeader;
