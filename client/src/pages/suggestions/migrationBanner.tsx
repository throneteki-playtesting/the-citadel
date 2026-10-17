import classNames from "classnames";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";
import { faThumbsUp } from "@fortawesome/free-solid-svg-icons";
import { LegacyThreadInfo } from "../../api";
import DiscordLinkButton from "../../components/discordLinkButton";
import Timestamp from "../../components/timestamp";

/** Heads the editor while it migrates an old suggestion-forum thread - which thread, what comes across from
 *  it, and what happens to it once the suggestion is submitted */
export default function MigrationBanner({ thread, className }: { thread: LegacyThreadInfo; className?: string }) {
    return (
        <div
            className={classNames(
                "flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border border-l-4 border-primary/30 bg-primary/5 p-3",
                className
            )}
        >
            <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="shrink-0 flex items-center justify-center size-9 rounded-full bg-primary/15 text-primary">
                    <FontAwesomeIcon icon={faDiscord} />
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-cinzel uppercase tracking-wide text-xs text-primary">
                        Migrating a forum thread
                    </span>
                    <span className="font-semibold truncate">{thread.name}</span>
                    <span className="flex flex-wrap items-center gap-x-3 text-xs text-foreground/60">
                        <span>
                            Started <Timestamp date={new Date(thread.createdAt)} variant="long" inline />
                        </span>
                        <span>
                            <FontAwesomeIcon icon={faThumbsUp} /> {thread.likes} carried over
                        </span>
                    </span>
                    <span className="text-xs text-foreground/50">
                        Once submitted, it gets a new thread - this one is closed, with a link to where it went.
                    </span>
                </div>
            </div>
            <DiscordLinkButton url={thread.url} className="w-full sm:w-auto shrink-0">
                Open thread
            </DiscordLinkButton>
        </div>
    );
}
