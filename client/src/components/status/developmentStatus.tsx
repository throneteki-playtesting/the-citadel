import { faStar } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";
import { isPreview, parseCardCode } from "common/utils";
import { ReactNode, useMemo } from "react";
import { UIColor } from "../../types";

type StatusData = { icon?: ReactNode, label: string, color: UIColor, href?: string };

const DevelopmentStatus = ({ draft, latest }: DevelopmentStatusProps) => {
    const data = useMemo<StatusData | null>(() => {
        if (draft) {
            const label = isPreview(draft) ? "Preview" : "Drafting Changes";
            return {
                icon: <FontAwesomeIcon icon={faStar} size="2xl"/>,
                color: "secondary",
                label
            };
        }
        if (latest) {
            if (latest.release) {
                const href = `https://thronesdb.com/card/${parseCardCode(true, latest.project, latest.release.number)}`;
                return {
                    label: `Released (${latest.release.short})`,
                    color: "success",
                    href
                };
            } else {
                return {
                    label: "Playtesting Latest",
                    color: "success"
                };
            }
        }
        return null;
    }, [draft, latest]);

    if (!data) {
        return null;
    }
    const alert = <Alert icon={data.icon} color={data.color} title="Development" className="h-full" hideIconWrapper description={data.label}></Alert>;
    if (data.href) {
        return <a href={data.href} target="_blank">{alert}</a>;
    }
    return alert;
};

type DevelopmentStatusProps = { draft?: IPlaytestCard, latest?: IPlaytestCard }

export default DevelopmentStatus;