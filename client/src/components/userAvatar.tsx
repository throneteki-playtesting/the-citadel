import { ReactNode, Ref } from "react";
import { Avatar, AvatarProps } from "@heroui/react";
import classNames from "classnames";
import { useGetUserQuery } from "../api";
import { BaseElementProps } from "../types";

export default function UserAvatar({ className, style, discordId, title, size = "sm", ref, ...rest }: UserAvatarProps) {
    const { data: user, isLoading } = useGetUserQuery({ discordId });
    return (
        <Avatar
            ref={ref}
            size={size}
            src={user?.avatarUrl}
            name={user?.displayname?.charAt(0) ?? "?"}
            isDisabled={isLoading}
            // `title={false}` opts out entirely - for a caller already wrapping this in its own
            // TouchTooltip, the native title attribute duplicates it (both show up on hover).
            title={title === false ? undefined : (title ?? user?.displayname)}
            className={classNames("shrink-0", className)}
            style={style}
            {...rest}
        />
    );
}

// Avatar, display name, and whatever the caller wants pinned to the right of the row
export function UserRow({
    className,
    style,
    discordId,
    trailing,
    avatarClassName,
    textClassName = "text-sm"
}: UserRowProps) {
    const { data: user } = useGetUserQuery({ discordId });
    return (
        <div className={classNames("flex items-center gap-2 min-w-0", className)} style={style}>
            <UserAvatar discordId={discordId} className={avatarClassName} />
            <span className={classNames("min-w-0 truncate", textClassName)} title={user?.displayname}>
                {user?.displayname ?? "…"}
            </span>
            {trailing}
        </div>
    );
}

type UserAvatarProps = Omit<AvatarProps, "src" | "name" | "isDisabled" | "children" | "title"> &
    Omit<BaseElementProps, "children"> & {
        ref?: Ref<HTMLSpanElement>;
        discordId: string;
        /** Overrides the hover title, which is otherwise just the display name - pass `false` to
         *  suppress the native title entirely (eg. when already wrapped in a TouchTooltip). */
        title?: string | false;
        /** HeroUI Avatar size; defaults to the small avatar used in rows and tallies */
        size?: AvatarProps["size"];
    };

type UserRowProps = Omit<BaseElementProps, "children"> & {
    discordId: string;
    trailing?: ReactNode;
    /** Overrides the avatar's size classes - eg. shrinking it to match a smaller line of text. */
    avatarClassName?: string;
    /** Overrides the name's text size - defaults to text-sm. */
    textClassName?: string;
};
