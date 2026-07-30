import { faScroll } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { addToast, Button, Link, Spinner } from "@heroui/react";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { useAssignPlaytestingRoleMutation } from "../../api";
import { useAuth } from "../../hooks/useAuth";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import PermissionGate from "../../components/permissionGate";
import Permission from "common/models/permissions";
import { isPlaytester } from "common/utils";
import { BaseElementProps } from "../../types";

const DISCORD_SERVER_INVITE_URL = import.meta.env.VITE_DISCORD_SERVER_INVITE_URL;

export default function WelcomeBanner({ onBecamePlaytester }: WelcomeBannerProps = {}) {
    const { user, isAuthenticated, isProcessing, login } = useAuth();
    const [assignPlaytestingRole, { isLoading: isAssigning }] = useAssignPlaytestingRoleMutation();

    const onBecomePlaytesterClick = async () => {
        try {
            await assignPlaytestingRole().unwrap();
            addToast({ title: "Welcome to the Playtesting Team!", color: "success" });
            onBecamePlaytester?.();
        } catch (err) {
            const isMemberNotFound = (err as FetchBaseQueryError)?.status === 404;
            addToast({
                title: "Could not assign role",
                color: "danger",
                description: isMemberNotFound
                    ? "You need to join the Discord server before becoming a playtester."
                    : "Something went wrong. Please try again."
            });
        }
    };

    // Should not be possible to reach this with login page, but worth being here as a safeguard (was an older feature)
    if (!isAuthenticated || !user) {
        return (
            <div className="border border-content3 bg-content1 p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                    <div className="font-cinzel text-2xl">
                        <FontAwesomeIcon icon={faScroll} /> Welcome to the Citadel
                    </div>
                    <div className="font-sans text-foreground/70 text-base">
                        You are welcome to browse the public archives — active projects and their latest cards are open
                        to all. Should you wish to delve deeper into the Citadel's records, please log in.
                    </div>
                </div>
                <Button
                    startContent={
                        isProcessing ? <Spinner color="secondary" size="sm" /> : <FontAwesomeIcon icon={faDiscord} />
                    }
                    isDisabled={isProcessing}
                    color="primary"
                    onPress={() => login()}
                    className="font-cinzel shrink-0 font-semibold"
                >
                    Log in with Discord
                </Button>
            </div>
        );
    }

    if (!user.roles.some((role) => role.name === "@everyone")) {
        return (
            <div className="border border-content3 bg-content1 p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                    <div className="font-cinzel text-2xl">
                        <FontAwesomeIcon icon={faScroll} /> Welcome to the Citadel
                    </div>
                    <div className="font-sans text-foreground/70 text-base">
                        You are welcome to browse the public archives — active projects and their latest cards are open
                        to all. To access playtesting records, decks, reviews and statistics, join the Design &
                        Playtesting discord server and follow the instructions to become a playtester.
                    </div>
                </div>
                {DISCORD_SERVER_INVITE_URL && (
                    <Button
                        as={Link}
                        href={DISCORD_SERVER_INVITE_URL}
                        target="_blank"
                        rel="noreferrer"
                        color="primary"
                        className="font-cinzel shrink-0 font-semibold"
                    >
                        <FontAwesomeIcon icon={faDiscord} /> Join the Server
                    </Button>
                )}
            </div>
        );
    }

    if (!isPlaytester(user)) {
        return (
            <div className="border border-content3 bg-content1 p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                    <div className="font-cinzel text-2xl">
                        <FontAwesomeIcon icon={faScroll} /> Welcome to the Citadel
                    </div>
                    <div className="font-sans text-foreground/70 text-base">
                        You are welcome to browse the public archives — active projects and their latest cards are open
                        to all. To access playtesting records, decks, reviews and statistics, you must become a
                        playtester.
                    </div>
                </div>
                <PermissionGate requires={Permission.ASSIGN_OWN_PLAYTESTING_ROLE}>
                    <Button
                        startContent={
                            isAssigning ? <Spinner color="secondary" size="sm" /> : <FontAwesomeIcon icon={faDiscord} />
                        }
                        isDisabled={isAssigning}
                        color="primary"
                        onPress={onBecomePlaytesterClick}
                        className="font-cinzel shrink-0 font-semibold"
                    >
                        Become a Playtester
                    </Button>
                </PermissionGate>
            </div>
        );
    }

    return null;
}

type WelcomeBannerProps = Omit<BaseElementProps, "children"> & {
    onBecamePlaytester?: () => void;
};
