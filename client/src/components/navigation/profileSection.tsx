import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Avatar, Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Link, Skeleton, Spinner } from "@heroui/react";
import { useState } from "react";
import classNames from "classnames";
import { PageItem } from "../../pages";
import { useAuth } from "../../hooks/useAuth";

const ProfileSection = ({ children: items = [] }: ProfileSectionProps) => {
    const { user, isAuthenticated, isLoading, isProcessing, login, logout, impersonation, isImpersonating, stopImpersonating, isImpersonationActionPending } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    if (!isAuthenticated && !isLoading) {
        const startContent = isProcessing ? <Spinner size="sm" /> : <FontAwesomeIcon icon={faDiscord} />;
        return (
            <Button startContent={startContent} isDisabled={isProcessing} onPress={login} variant="flat" className="font-cinzel">
                <span className="max-sm:hidden">Log in with Discord</span>
                <span className="sm:hidden">Log in</span>
            </Button>
        );
    }

    return (
        <Skeleton isLoaded={isAuthenticated && !isLoading} className="rounded-full">
            <Dropdown>
                <DropdownTrigger>
                    <div className="relative">
                        <Avatar
                            isDisabled={isLoading}
                            src={user?.avatarUrl}
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className={classNames("cursor-pointer", { "ring-2 ring-warning ring-offset-2 ring-offset-background": isImpersonating })}
                        />
                        {isLoading && <Spinner className="absolute inset-0" size="sm" />}
                        {isImpersonating && (
                            <span className="absolute -bottom-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-warning text-warning-foreground">
                                <FontAwesomeIcon icon={faEye} className="text-[9px]" />
                            </span>
                        )}
                    </div>
                </DropdownTrigger>
                <DropdownMenu>
                    {(isImpersonating && impersonation ? [
                        <DropdownItem key="impersonation-status" isReadOnly className="cursor-default opacity-100">
                            <div className="flex flex-col">
                                <span className="text-tiny text-default-500">Viewing as {impersonation.type}</span>
                                <span className="font-semibold">{impersonation.target.name}</span>
                            </div>
                        </DropdownItem>
                    ] : []).concat(
                        items.filter((item) => item.label).map((item) => (
                            <DropdownItem key={item.label!} as={Link} href={item.path}>
                                {item.label}
                            </DropdownItem>
                        ))
                    ).concat(
                        isImpersonating ? [
                            <DropdownItem key="stop-impersonating" onPress={stopImpersonating} isDisabled={isImpersonationActionPending} color="warning">
                                Exit Impersonation
                            </DropdownItem>
                        ] : []
                    ).concat(
                        <DropdownItem key="logout" onPress={logout} color="danger">
                            Log out
                        </DropdownItem>
                    )}
                </DropdownMenu>
            </Dropdown>
        </Skeleton>
    );
};

type ProfileSectionProps = { children?: PageItem[] }

export default ProfileSection;
