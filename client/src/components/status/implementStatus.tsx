import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Alert, Spinner } from "@heroui/react";
import { IPlaytestCard } from "common/models/cards";
import { useCardSync } from "../../api/hooks";
import { ReactNode, useMemo } from "react";
import { UIColor } from "../../types";
import ThronesIcon from "../thronesIcon";
import { faRotate } from "@fortawesome/free-solid-svg-icons";
import { useSyncCardGithubMutation } from "../../api";

type StatusData = { icon?: ReactNode, label: string, color: UIColor, onPress?: () => void, href?: string };

const ImplementStatus = ({ card }: ImplementStatusProps) => {
    const [syncCardGithub, { isLoading: isSyncing }] = useSyncCardGithubMutation();
    const { status, step, error } = useCardSync(card).github;
    const data = useMemo<StatusData | null>(() => {
        if (!card) {
            return null;
        }
        if (status === "progress" || isSyncing) {
            return {
                icon: <Spinner />,
                label: step ?? status ?? "Processing",
                color: "secondary"
            };
        }

        const syncAsync = async () => await syncCardGithub({ project: card.project, number: card.number, version: card.version }).unwrap();

        if (status === "error") {
            return {
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "danger",
                label: error ?? "Failed to Sync"
            };
        }
        if (card.release) {
            return {
                icon: <ThronesIcon name="power"/>,
                label: "Implemented (Live)",
                color: "success",
                href: "https://theironthrone.net"
            };
        }
        if (!card.github && !card.implemented) {
            return {
                icon: <FontAwesomeIcon icon={faRotate} size="xl" />,
                onPress: syncAsync,
                color: "secondary",
                label: "Requires Syncing"
            };
        }
        if (card.implemented) {
            return {
                icon: <ThronesIcon name="power"/>,
                label: "Implemented",
                color: "success",
                href: "https://playtesting.theironthrone.net"
            };
        }
        const href = card.github!.issueUrl;
        const icon = <FontAwesomeIcon icon={faGithub} size="2xl"/>;
        switch (card.github!.status) {
            case "open": {
                return {
                    icon,
                    label: "Github Issue Open",
                    color: "warning",
                    href
                };
            }
            case "closed": {
                return {
                    icon,
                    label: "Github Issue Closed",
                    color: "success",
                    href
                };
            }
        }
        return null;
    }, [card, error, isSyncing, status, step, syncCardGithub]);

    if (!data) {
        return null;
    }
    const alert = <Alert icon={data.icon} color={data.color} title="Online Platform" className="h-full" hideIconWrapper description={data.label}></Alert>;
    if (data.onPress) {
        return <a className="cursor-pointer" onClick={data.onPress}>{alert}</a>;
    }
    if (data.href) {
        return <a href={data.href} target={"_blank"}>{alert}</a>;
    }
    return alert;
};

type ImplementStatusProps = { card?: IPlaytestCard }

export default ImplementStatus;