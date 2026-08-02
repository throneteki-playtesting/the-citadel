import { ReactNode } from "react";
import { Avatar } from "@heroui/react";
import classNames from "classnames";
import { useGetUserQuery } from "../api";
import { BaseElementProps } from "../types";

// A user's avatar looked up by id, falling back to their initial while the lookup is in flight or the
// user is unknown. Shared so every avatar in the app agrees on that fallback
export default function UserAvatar({ className, style, discordId, title }: UserAvatarProps) {
    const { data: user, isLoading } = useGetUserQuery({ discordId });
    return (
        <Avatar
            size="sm"
            src={user?.avatarUrl}
            name={user?.displayname?.charAt(0) ?? "?"}
            isDisabled={isLoading}
            title={title ?? user?.displayname}
            className={classNames("shrink-0", className)}
            style={style}
        />
    );
}

// Avatar, display name, and whatever the caller wants pinned to the right of the row
export function UserRow({ className, style, discordId, trailing }: UserRowProps) {
    const { data: user } = useGetUserQuery({ discordId });
    return (
        <div className={classNames("flex items-center gap-2 min-w-0", className)} style={style}>
            <UserAvatar discordId={discordId} />
            <span className="text-sm min-w-0 truncate" title={user?.displayname}>
                {user?.displayname ?? "…"}
            </span>
            {trailing}
        </div>
    );
}

type UserAvatarProps = Omit<BaseElementProps, "children"> & {
    discordId: string;
    /** Overrides the hover title, which is otherwise just the display name */
    title?: string;
};

type UserRowProps = Omit<BaseElementProps, "children"> & {
    discordId: string;
    trailing?: ReactNode;
};
