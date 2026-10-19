import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { faThumbsUp } from "@fortawesome/free-solid-svg-icons";
import { LegacyThreadInfo } from "../../api";
import DiscordLinkButton from "../../components/discordLinkButton";
import Timestamp from "../../components/timestamp";
import { TouchTooltip } from "../../components/touchTooltip";

const AFTERWARDS = "Once submitted, it gets a new thread - this one is closed, with a link to where it went.";

/** Heads the editor while it migrates an old suggestion-forum thread - which thread, what comes across from
 *  it, and what happens to it once the suggestion is submitted. Below `sm` it is one line, the explanation
 *  moving into a tooltip */
export default function MigrationBanner({ thread, className }: { thread: LegacyThreadInfo; className?: string }) {
    return (
        <div
            className={classNames(
                "flex items-center gap-2 sm:gap-3 rounded-md border border-l-4 border-primary/30 bg-primary/5 px-2 py-1.5 sm:p-3",
                className
            )}
        >
            <div className="shrink-0 flex items-center justify-center size-7 sm:size-9 rounded-full bg-primary/15 text-primary text-sm sm:text-base">
                <FontAwesomeIcon icon={faDiscord} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="hidden sm:block font-cinzel uppercase tracking-wide text-xs text-primary">
                    Migrating a forum thread
                </span>
                <span className="font-semibold truncate text-sm sm:text-base">{thread.name}</span>
                <span className="flex flex-wrap items-center gap-x-3 text-xs text-foreground/60">
                    <span className="hidden sm:inline">
                        Started <Timestamp date={new Date(thread.createdAt)} variant="long" inline />
                    </span>
                    <span>
                        <FontAwesomeIcon icon={faThumbsUp} /> {thread.likes} carried over
                    </span>
                    <TouchTooltip content={<div className="max-w-56 px-1 py-0.5 text-sm">{AFTERWARDS}</div>}>
                        <span className="sm:hidden cursor-help underline decoration-dotted">What happens next?</span>
                    </TouchTooltip>
                </span>
                <span className="hidden sm:block text-xs text-foreground/50">{AFTERWARDS}</span>
            </div>
            <DiscordLinkButton url={thread.url} className="shrink-0">
                <span className="sm:hidden">Open</span>
                <span className="hidden sm:inline">Open thread</span>
            </DiscordLinkButton>
        </div>
    );
}
