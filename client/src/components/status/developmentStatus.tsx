import { faStar } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IPlaytestCard } from "common/models/cards";
import { isPreview, parseCardCode } from "common/utils";
import { useMemo } from "react";
import { BaseStatus, StatusData } from "./baseStatus";
import { BaseElementProps } from "../../types";

const DevelopmentStatus = ({ className, style, isIconOnly, draft, latest }: DevelopmentStatusProps) => {
    const data = useMemo<StatusData | null>(() => {
        if (draft) {
            const description = isPreview(draft) ? "Preview" : "Drafting Changes";
            return {
                icon: <FontAwesomeIcon icon={faStar} size="2xl"/>,
                color: "secondary",
                description
            };
        }
        if (latest) {
            if (latest.release) {
                const href = `https://thronesdb.com/card/${parseCardCode(true, latest.project, latest.release.number)}`;
                return {
                    description: `Released (${latest.release.short})`,
                    color: "success",
                    href
                };
            } else {
                return {
                    description: "Playtesting Latest",
                    color: "success"
                };
            }
        }
        return null;
    }, [draft, latest]);

    if (!data) {
        return null;
    }

    return <BaseStatus className={className} style={style} isIconOnly={isIconOnly} data={{ title: "Development", ...data }} />;
};

type DevelopmentStatusProps = Omit<BaseElementProps, "children"> & {
    draft?: IPlaytestCard,
    latest?: IPlaytestCard,
    isIconOnly?: boolean
}

export default DevelopmentStatus;