import { ReactNode, useEffect } from "react";
import { Radio, RadioGroup, Skeleton } from "@heroui/react";
import classNames from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSeedling, faThumbsUp } from "@fortawesome/free-solid-svg-icons";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { LegacyThreadInfo } from "../../api";
import DiscordLinkButton from "../../components/discordLinkButton";
import SectionTitle from "../../components/sectionTitle";
import SectionBlurb from "../../components/sectionBlurb";
import StatusNotice from "../../components/statusNotice";
import Timestamp from "../../components/timestamp";
import { useIsPageActive } from "../../hooks/useIsPageActive";

/** The choice meaning "no earlier thread" - every other value is a thread id */
export const POST_FRESH = "fresh";

const FADE = { duration: 0.25 } as const;

// The card carries the highlight, so what sits beside the radio (likes, the link) shares it - the radio itself
// only fills the part of the card which picks it
const RADIO_CLASSES = {
    base: "m-0 max-w-none flex-1 min-w-0 items-center gap-3 p-3 sm:p-4 cursor-pointer",
    labelWrapper: "flex-1 min-w-0 ms-1",
    label: "w-full"
};

function OptionCard({ isSelected, children }: { isSelected: boolean; children: ReactNode }) {
    return (
        <div
            className={classNames(
                "flex items-center gap-3 rounded-lg border-2 pr-3 transition-colors",
                isSelected ? "border-primary bg-primary/10" : "border-content3 bg-content1 hover:bg-content2"
            )}
        >
            {children}
        </div>
    );
}

/** The legacy editor's last page - whether one of the designer's older suggestion-forum threads is this
 *  card, found in the background once the card is locked in on the first page */
export default function LegacyThreadChoice({
    threads,
    isLoading,
    isError,
    value,
    onChange,
    onSearch
}: LegacyThreadChoiceProps) {
    // Searched on leaving the first page; this covers arriving here without that having happened
    const isActive = useIsPageActive();
    useEffect(() => {
        if (isActive && !threads && !isLoading && !isError) {
            onSearch();
        }
    }, [isActive, threads, isLoading, isError, onSearch]);

    return (
        <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col gap-2">
                <SectionTitle size="sm">Existing Forum Threads</SectionTitle>
                <SectionBlurb>
                    Submitting always posts a new thread for this suggestion. If you started one for this card in the
                    suggestion forum before the Citadel, link it here - its date and likes come across, and it's closed
                    with a pointer to the new thread.
                </SectionBlurb>
            </div>

            {isError && (
                <StatusNotice
                    icon={faDiscord}
                    color="warning"
                    label="Couldn't search the forum"
                    detail="You can still post it fresh - or go back a page and return to search again."
                />
            )}

            {isLoading ? (
                <div className="flex flex-col gap-3" aria-busy>
                    {Array.from({ length: 2 }).map((_, index) => (
                        <Skeleton key={index} className="h-[4.5rem] rounded-lg" />
                    ))}
                </div>
            ) : (
                <RadioGroup
                    value={value ?? ""}
                    onValueChange={onChange}
                    aria-label="Existing forum thread"
                    classNames={{ wrapper: "flex flex-col gap-3" }}
                >
                    <AnimatePresence initial={false}>
                        {(threads ?? []).map((thread) => (
                            <motion.div
                                key={thread.id}
                                layout
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={FADE}
                            >
                                <OptionCard isSelected={value === thread.id}>
                                    <Radio value={thread.id} classNames={RADIO_CLASSES}>
                                        <div className="flex flex-col gap-0.5 min-w-0">
                                            <span className="font-semibold truncate">{thread.name}</span>
                                            <span className="text-xs text-foreground/60">
                                                Started{" "}
                                                <Timestamp date={new Date(thread.createdAt)} variant="long" inline />
                                            </span>
                                        </div>
                                    </Radio>
                                    <span
                                        className="shrink-0 flex items-center gap-1.5 text-sm text-foreground/70"
                                        aria-label={`${thread.likes} likes`}
                                    >
                                        {thread.likes}
                                        <FontAwesomeIcon icon={faThumbsUp} />
                                    </span>
                                    <DiscordLinkButton url={thread.url} variant="solid" className="shrink-0">
                                        View
                                    </DiscordLinkButton>
                                </OptionCard>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    <motion.div layout transition={FADE}>
                        <OptionCard isSelected={value === POST_FRESH}>
                            <Radio value={POST_FRESH} classNames={RADIO_CLASSES}>
                                <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="flex items-center gap-2 font-semibold">
                                        <FontAwesomeIcon icon={faSeedling} className="text-foreground/50" />
                                        Start fresh, without linking
                                    </span>
                                    <span className="text-xs text-foreground/60">
                                        {threads?.length
                                            ? "None of these is this card - it gets a brand new thread, with no likes or history carried over."
                                            : "None of your threads in the suggestion forum look like this card - it gets a brand new thread, with no likes or history carried over."}
                                    </span>
                                </div>
                            </Radio>
                        </OptionCard>
                    </motion.div>
                </RadioGroup>
            )}
        </div>
    );
}

type LegacyThreadChoiceProps = {
    /** Undefined until the first search of this card has come back */
    threads?: LegacyThreadInfo[];
    /** Only the first search of a card - a refresh keeps what is already on screen */
    isLoading: boolean;
    isError: boolean;
    value?: string;
    onChange: (value: string) => void;
    onSearch: () => void;
};
