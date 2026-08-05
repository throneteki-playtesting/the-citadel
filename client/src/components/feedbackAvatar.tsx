import { Avatar, Badge } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { IReleaseCheck } from "common/models/slots";
import { SemanticVersion } from "common/utils";
import { User } from "common/models/auth";
import { useGetUserQuery } from "../api";
import { avatarBubbleClasses, avatarRingClasses } from "../constants";
import { BaseElementProps } from "../types";
import { TouchTooltip } from "./touchTooltip";
import { releaseCheckVerdict } from "./releaseCheckVerdict";

export default function FeedbackAvatar({
    className,
    style,
    discordId,
    entry,
    latestVersion,
    isYou = false,
    isSelected,
    onSelect
}: FeedbackAvatarProps) {
    const { data: fetchedUser, isLoading } = useGetUserQuery({ discordId }, { skip: isYou });

    return (
        <FeedbackAvatarView
            className={className}
            style={style}
            user={fetchedUser}
            isLoading={!isYou && isLoading}
            entry={entry}
            latestVersion={latestVersion}
            isYou={isYou}
            isSelected={isSelected}
            onSelect={onSelect}
        />
    );
}

// Split out so the "you" case can pass its user object straight from useAuth() without a redundant fetch
export function FeedbackAvatarView({
    className,
    style,
    user,
    isLoading,
    entry,
    latestVersion,
    isYou = false,
    isEditable = true,
    isSelected,
    onSelect
}: FeedbackAvatarViewProps) {
    const verdict = releaseCheckVerdict(entry, latestVersion);
    // The pencil is an edit affordance, so a check that can't be answered shows its verdict instead
    const isEditAffordance = isYou && isEditable;

    if (isYou && !entry) {
        return (
            <TouchTooltip content="Add your feedback">
                <button
                    type="button"
                    aria-label="Add your feedback"
                    className={classNames(
                        avatarBubbleClasses,
                        "hover:border-primary hover:text-primary",
                        isSelected && classNames(avatarRingClasses, "ring-primary"),
                        className
                    )}
                    style={style}
                    onClick={onSelect}
                >
                    <FontAwesomeIcon icon={faPlus} />
                </button>
            </TouchTooltip>
        );
    }

    return (
        <button
            type="button"
            className={classNames(
                "shrink-0 flex rounded-full cursor-pointer transition-transform hover:scale-105",
                className
            )}
            style={style}
            title={
                verdict?.stale
                    ? `${isYou ? "Your" : `${user?.displayname}'s`} check was made against v${entry?.version} - needs re-checking`
                    : isYou
                      ? "You"
                      : user?.displayname
            }
            onClick={onSelect}
        >
            <Badge
                isOneChar
                content={
                    isEditAffordance ? (
                        <FontAwesomeIcon icon={faPencil} className="text-[.6rem]" />
                    ) : verdict ? (
                        <FontAwesomeIcon icon={verdict.icon} className="text-[.6rem]" />
                    ) : undefined
                }
                color={isEditAffordance ? "primary" : (verdict?.color ?? "default")}
                placement="bottom-right"
                isInvisible={!isEditAffordance && !entry}
                showOutline={false}
                className={classNames(!isEditAffordance && verdict?.stale && verdict.staleBadge)}
            >
                <Avatar
                    src={user?.avatarUrl}
                    name={user?.displayname?.charAt(0) ?? "?"}
                    isDisabled={isLoading}
                    className={classNames(
                        "transition-all",
                        isSelected
                            ? classNames(avatarRingClasses, "ring-primary")
                            : verdict
                              ? classNames(avatarRingClasses, verdict.ring)
                              : "ring-0"
                    )}
                />
            </Badge>
        </button>
    );
}

type FeedbackAvatarProps = Omit<BaseElementProps, "children"> & {
    discordId: string;
    entry?: IReleaseCheck;
    /** The slot's latest confirmed card version - anything else the entry answered is stale */
    latestVersion?: SemanticVersion;
    isYou?: boolean;
    isSelected: boolean;
    onSelect: () => void;
};

type FeedbackAvatarViewProps = Omit<BaseElementProps, "children"> & {
    user?: User;
    isLoading?: boolean;
    entry?: IReleaseCheck;
    latestVersion?: SemanticVersion;
    isYou?: boolean;
    /** Your own check shows its verdict rather than a pencil once it can no longer be answered */
    isEditable?: boolean;
    isSelected: boolean;
    onSelect: () => void;
};
