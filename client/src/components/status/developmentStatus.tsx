import { faCrosshairs, faFeather } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { isPreview, parseCardCode, SemanticVersion } from "common/utils";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BaseStatus, StatusData } from "./baseStatus";
import { BaseElementProps } from "../../types";
import { useGetCardsQuery, useGetProjectQuery, useGetSlotQuery } from "../../api";
import { highlightTarget } from "../../constants";

const DevelopmentStatus = ({ className, style, project, number, version, isIconOnly }: DevelopmentStatusProps) => {
    const navigate = useNavigate();
    const { data: cardsData, isLoading } = useGetCardsQuery({ filter: { project, number, version } });
    const { data: projectData } = useGetProjectQuery({ number: project });
    const { data: slotData } = useGetSlotQuery({ project, number });

    const nextRelease = useMemo(() => {
        const sorted = [...(projectData?.releases ?? [])].sort((a, b) => a.number - b.number);
        return sorted.find((release) => !release.releasedDate);
    }, [projectData?.releases]);

    const isNextRelease = !!nextRelease && slotData?.release?.code === nextRelease.code;

    const data = useMemo<StatusData | null>(() => {
        const title = "Development";
        const draft = cardsData?.items.find((card) => card.draft);
        if (draft) {
            const description = isPreview(draft) ? "Preview" : "Drafting Changes";
            return {
                title,
                icon: <FontAwesomeIcon icon={faFeather} size="xl" />,
                color: "primary",
                description
            };
        }
        const latest = cardsData?.items.find((card) => card.latest);
        if (latest) {
            if (latest.released) {
                const href = `https://thronesdb.com/card/${parseCardCode(true, latest.project, latest.released.number)}`;
                return {
                    title,
                    description: `Released (${latest.released.code})`,
                    color: "success",
                    href
                };
            } else if (isNextRelease && nextRelease) {
                return {
                    title,
                    icon: <FontAwesomeIcon icon={faCrosshairs} size="xl" />,
                    description: `Slotted for ${nextRelease.code}`,
                    color: "success",
                    onPress: () =>
                        navigate(`/project/${project}?tab=releases`, {
                            state: { highlight: highlightTarget.release(project, nextRelease.code) }
                        })
                };
            } else {
                return {
                    title,
                    description: "Playtesting Latest",
                    color: "success"
                };
            }
        }
        return {
            title,
            description: "Unknown",
            color: "default"
        };
    }, [cardsData?.items, isNextRelease, nextRelease, navigate, project]);

    return <BaseStatus className={className} style={style} isIconOnly={isIconOnly} data={data} isLoading={isLoading} />;
};

type DevelopmentStatusProps = Omit<BaseElementProps, "children"> & {
    project: number;
    number: number;
    version?: SemanticVersion;
    isIconOnly?: boolean;
};

export default DevelopmentStatus;
