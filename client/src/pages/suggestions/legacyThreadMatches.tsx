import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "framer-motion";
import { ICardSuggestion } from "common/models/cards";
import { useGetSuggestionThreadMatchesQuery } from "../../api";
import { openDiscordLink, useDiscordTarget } from "../../hooks/useDiscordLink";
import StatusNotice from "../../components/statusNotice";
import Timestamp from "../../components/timestamp";

// A pointer to the designer's old forum threads for this card; linking one happens on the completing editor's last page
export default function LegacyThreadMatches({ suggestion, className }: LegacyThreadMatchesProps) {
    const { data: threads } = useGetSuggestionThreadMatchesQuery({ id: suggestion.id! });
    const target = useDiscordTarget();

    const matches = threads ?? [];

    return (
        <AnimatePresence initial={false}>
            {matches.length > 0 && (
                <motion.div
                    key="thread-matches"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={className}
                >
                    <StatusNotice
                        icon={faDiscord}
                        iconPosition="title"
                        color="info"
                        label="Forum Threads Found"
                        detail={
                            matches.length === 1
                                ? "A thread in the suggestion forum has this card's name. Completing this suggestion offers to carry it across."
                                : `${matches.length} threads in the suggestion forum have this card's name. Completing this suggestion offers to carry one across.`
                        }
                    >
                        <Dropdown placement="bottom-end">
                            <DropdownTrigger>
                                <Button
                                    size="sm"
                                    variant="flat"
                                    color="primary"
                                    className="shrink-0 self-start sm:self-center"
                                    endContent={<FontAwesomeIcon icon={faCaretDown} />}
                                >
                                    View {matches.length === 1 ? "thread" : `${matches.length} threads`}
                                </Button>
                            </DropdownTrigger>
                            <DropdownMenu
                                aria-label="Matching forum threads"
                                onAction={(key) => openDiscordLink(String(key), target)}
                            >
                                {matches.map((thread) => (
                                    <DropdownItem
                                        key={thread.url}
                                        startContent={<FontAwesomeIcon icon={faDiscord} />}
                                        description={
                                            <>
                                                Started{" "}
                                                <Timestamp date={new Date(thread.createdAt)} variant="long" inline />
                                            </>
                                        }
                                    >
                                        {thread.name}
                                    </DropdownItem>
                                ))}
                            </DropdownMenu>
                        </Dropdown>
                    </StatusNotice>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

type LegacyThreadMatchesProps = {
    suggestion: ICardSuggestion;
    className?: string;
};
