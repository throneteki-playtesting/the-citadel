import { faScroll } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { addToast, Button, Spinner } from "@heroui/react";
import { Link } from "react-router-dom";
import { RootState } from "../../api/store";
import { useSelector } from "react-redux";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { useState } from "react";
import { useAssignPlaytestingRoleMutation } from "../../api";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";

const DISCORD_SERVER_INVITE_URL = import.meta.env.VITE_DISCORD_SERVER_INVITE_URL;

export default function WelcomeBanner() {
    const user = useSelector((state: RootState) => state.auth.user);
    const [isProcessing, setIsProcessing] = useState(false);
    const [assignPlaytestingRole, { isLoading: isAssigning }] = useAssignPlaytestingRoleMutation();

    const onLogin = async () => {
        setIsProcessing(true);
        window.location.href = "/auth/discord";
    };

    const onBecomePlaytester = async () => {
        try {
            await assignPlaytestingRole().unwrap();
            addToast({ title: "Welcome to the Playtesting Team!", color: "success" });
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

    if (!user) {
        return (
            <div className="border border-content3 bg-content1 p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                    <div className="font-cinzel text-2xl"><FontAwesomeIcon icon={faScroll}/> Welcome to the Citadel</div>
                    <div className="font-sans text-foreground/70 text-base">
                        You are welcome to browse the public archives — active projects and their latest cards are open to all. Should you wish to delve deeper into the Citadel's records, please log in.
                    </div>
                </div>
                <Button startContent={isProcessing ? <Spinner color="secondary" size="sm"/> : <FontAwesomeIcon icon={faDiscord} />} isDisabled={isProcessing} color="primary" onPress={onLogin} className="font-cinzel shrink-0 font-semibold">
                    Log in with Discord
                </Button>
            </div>
        );
    }

    if (!user.roles.some((role) => role.name === "@everyone")) {
        return (
            <div className="border border-content3 bg-content1 p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                    <div className="font-cinzel text-2xl"><FontAwesomeIcon icon={faScroll}/> Welcome to the Citadel</div>
                    <div className="font-sans text-foreground/70 text-base">
                        You are welcome to browse the public archives — active projects and their latest cards are open to all. To access playtesting records, decks, reviews and statistics, join the Design & Playtesting discord server and follow the instructions to become a playtester.
                    </div>
                </div>
                {DISCORD_SERVER_INVITE_URL && (
                    <Button as={Link} href={DISCORD_SERVER_INVITE_URL} target="_blank" color="primary" className="font-cinzel shrink-0 font-semibold">
                        <FontAwesomeIcon icon={faDiscord} /> Join the Server
                    </Button>)
                }
            </div>
        );
    }

    if (!user.roles.some((role) => role.name === "Playtesting Team")) {
        return (
            <div className="border border-content3 bg-content1 p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                    <div className="font-cinzel text-2xl"><FontAwesomeIcon icon={faScroll}/> Welcome to the Citadel</div>
                    <div className="font-sans text-foreground/70 text-base">
                        You are welcome to browse the public archives — active projects and their latest cards are open to all. To access playtesting records, decks, reviews and statistics, you must become a playtester.
                    </div>
                </div>
                <Button
                    startContent={isAssigning ? <Spinner color="secondary" size="sm" /> : <FontAwesomeIcon icon={faDiscord} />}
                    isDisabled={isAssigning}
                    color="primary"
                    onPress={onBecomePlaytester}
                    className="font-cinzel shrink-0 font-semibold"
                >
                    Become a Playtester
                </Button>
            </div>
        );
    }

    // TODO: Consider a dismissable welcome banner for newly signed in/added members
    return null;
}