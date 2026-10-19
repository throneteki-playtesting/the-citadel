import { Avatar, AvatarGroup } from "@heroui/react";
import classNames from "classnames";
import { IPoolMark } from "common/models/projects";
import { TouchTooltip } from "../../../components/touchTooltip";
import UserAvatar, { UserRow } from "../../../components/userAvatar";
import { stackedAvatarClasses } from "../../../constants";

const MAX_MARKERS = 4;

// Who has set a suggestion aside in the pool, as a stack of avatars - the tooltip names them, earliest first
export default function PoolMarkers({ marks, className }: PoolMarkersProps) {
    const earliestFirst = [...marks].sort((a, b) => new Date(a.added).getTime() - new Date(b.added).getTime());
    return (
        <TouchTooltip
            placement="top"
            content={
                <div className="flex w-56 max-w-full flex-col gap-1.5 py-1">
                    <span className="text-xs text-foreground/50">Added to the pool by</span>
                    {earliestFirst.map((mark) => (
                        <UserRow key={mark.user} discordId={mark.user} />
                    ))}
                </div>
            }
        >
            <div className={classNames("w-fit cursor-help", className)}>
                <AvatarGroup
                    size="sm"
                    max={MAX_MARKERS}
                    isBordered
                    className="-space-x-2"
                    renderCount={(count: number) => (
                        <Avatar size="sm" name={`+${count}`} className={stackedAvatarClasses} />
                    )}
                >
                    {earliestFirst.map((mark) => (
                        <StackedMarker key={mark.user} discordId={mark.user} />
                    ))}
                </AvatarGroup>
            </div>
        </TouchTooltip>
    );
}

// AvatarGroup overwrites the className of its direct children when it clones them, so the stacked styling goes through
// a wrapper to stay out of its reach
function StackedMarker({ discordId }: { discordId: string }) {
    return <UserAvatar discordId={discordId} title={false} className={stackedAvatarClasses} />;
}

type PoolMarkersProps = {
    marks: IPoolMark[];
    className?: string;
};
