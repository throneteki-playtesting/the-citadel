import { useGetPlaytestingUpdateCardsQuery, useGetPlaytestingUpdatesQuery, useGetProjectQuery } from "../../api";
import { useMemo } from "react";
import { Alert, Skeleton } from "@heroui/react";
import SectionTitle from "../../components/sectionTitle";
import { faCheckSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import Permission from "common/models/permissions";
import { IPlaytestingUpdate } from "common/models/projects";
import PermissionedLink from "../../components/permissionedLink";
import Timestamp from "../../components/timestamp";
import { BaseElementProps } from "../../types";
import { Faction, NoteType } from "common/models/cards";
import { changeTypeClasses, factionBarClasses } from "../../constants";
import { TouchTooltip } from "../../components/touchTooltip";
import { ChangeType } from "common/types";
import ThronesIcon from "../../components/thronesIcon";

export default function RecentPlaytestingUpdates() {
    const items = 3;
    const { data, isLoading } = useGetPlaytestingUpdatesQuery({ orderBy: { updated: "desc" }, page: 1, perPage: items });

    if (isLoading) {
        return (
            <div className="p-4 space-y-1 transition-colors">
                <div className="flex gap-3">
                    <div className="min-w-0 space-y-1">
                        <Skeleton className="w-32 h-6 rounded-sm"/>
                        <Skeleton className="w-64 h-4 rounded-sm"/>
                    </div>
                </div>
                <Skeleton className="w-full h-32 rounded-sm"/>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <SectionTitle size="sm" indent="xs">
                Recent PT Updates
            </SectionTitle>
            <div className="bg-content1 border border-content3 divide-y-1 divide-content3">
                {data?.items.map((pu) => (
                    <PlaytestingUpdateMiniCard key={`${pu.project}|${pu.version}`} playtestingUpdate={pu} />
                ))}
            </div>
        </div>
    );
}

function PlaytestingUpdateMiniCard({ className, style, playtestingUpdate }: PlaytestingUpdateMiniCardProps) {
    const { data: project, isLoading: isProjectLoading } = useGetProjectQuery({ number: playtestingUpdate.project });
    const { data: cards, isLoading: isCardsLoading } = useGetPlaytestingUpdateCardsQuery({ project: playtestingUpdate.project, version: playtestingUpdate.version });

    const { factionCounts, total, noteMap } = useMemo(() => {
        let total = 0;
        const factionCounts = cards?.reduce<Partial<Record<Faction, number>>>((map, card) => {
            total++;
            map[card.faction] = (map[card.faction] ?? 0) + 1;
            return map;
        }, {}) ?? {};

        const noteMap = cards?.reduce<Record<NoteType, number>>((map, card) => {
            if (card.note) map[card.note.type]++;
            return map;
        }, { updated: 0, reworked: 0, replaced: 0 }) ?? {};
        return { factionCounts, total, noteMap };
    }, [cards]);

    if (isProjectLoading || isCardsLoading) {
        return (
            <div className="p-4 space-y-1 transition-colors">
                <div className="flex gap-3">
                    <div className="min-w-0 space-y-1">
                        <Skeleton className="w-32 h-6 rounded-sm"/>
                        <Skeleton className="w-64 h-4 rounded-sm"/>
                    </div>
                </div>
                <Skeleton className="w-full h-32 rounded-sm"/>
            </div>
        );
    }

    if (!project || !cards) {
        return (
            <Alert color="danger" radius="none">
                <div className="hidden">{`Project: ${playtestingUpdate.project}, Version: ${playtestingUpdate.version}`}</div>
                <div className="text-sm">Failed to load playtesting update. Please alert an administrator.</div>
            </Alert>
        );
    }

    const isImplemented = playtestingUpdate._metadata?.github?.code?.status === "closed" && !!playtestingUpdate._metadata?.github?.code?.mergedAt;


    return (
        <div>
            <PermissionedLink to={`/project/${playtestingUpdate.project}/update/${playtestingUpdate.version}`} requires={Permission.READ_PLAYTESTING_UPDATES}>
                <div className={classNames("p-4 space-y-1 hover:bg-content2 transition-colors", className)} style={style}>
                    <div className="flex gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap opacity-75">
                                <div className="tracking-wider font-cinzel uppercase text-foreground">
                                    <span className="text-foreground text-sm">{project.name} - <span className="font-semibold">#{playtestingUpdate.version}</span></span>
                                </div>
                                {isImplemented && (
                                    <FontAwesomeIcon icon={faCheckSquare} className="text-success/80"/>
                                )}
                            </div>
                        </div>
                        <Timestamp className="ml-auto shrink-0 text-xs italic text-foreground/40 leading-none font-sans" date={new Date(playtestingUpdate.updated)} />
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-0.5 flex-wrap">
                            {Object.entries(noteMap).filter(([, count]) => Number(count) > 0).map(([type, count]) => (<div key={type} className={classNames("bg-content3/50 px-2 text-xs rounded-full font-sans opacity-50 border-1", changeTypeClasses[type as ChangeType])}>{String(count)} {type}</div>))}
                        </div>
                        <div className="flex w-full h-3 overflow-hidden rounded-sm border border-content3">
                            {Object.entries(factionCounts).filter(([, count]) => Number(count) > 0).map(([faction, count]) => (
                                <TouchTooltip
                                    key={faction}
                                    content={<div className="text-sm leading-0 font-cinzel"><ThronesIcon name={faction as Faction} /> {count} Change{count > 1 ? "s" : ""}</div>}
                                    size="sm"
                                    delay={0}
                                    closeDelay={0}>
                                    <div className={classNames(factionBarClasses[faction as Faction], "hover:brightness-150 hover:border-1 border-white transition-all cursor-default")} style={{ width: `${(Number(count) / total) * 100}%` }} />
                                </TouchTooltip>
                            ))}
                        </div>
                    </div>
                </div>
            </PermissionedLink>
        </div>
    );
}
type PlaytestingUpdateMiniCardProps = Omit<BaseElementProps, "children"> & {
    playtestingUpdate: IPlaytestingUpdate;
    maxCards?: number;
}