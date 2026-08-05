import { Badge } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faQuestion, faThumbsUp } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { IReleaseCheck } from "common/models/slots";
import { SemanticVersion } from "common/utils";
import { TouchTooltip } from "../../../components/touchTooltip";
import { releaseCheckVerdict, staleForegroundClasses } from "../../../components/releaseCheckVerdict";

// Your own release-check verdict, shown inside a card capsule
export default function ReleaseCheckButton({ entry, latestVersion, className, onPress }: ReleaseCheckButtonProps) {
    const verdict = releaseCheckVerdict(entry, latestVersion);

    const tooltip =
        entry && verdict ? (
            <div className="flex flex-col">
                <span className="text-xs text-secondary italic">You marked this as</span>
                <span>
                    <FontAwesomeIcon icon={verdict.icon} /> {verdict.label}
                </span>
                {verdict.stale && (
                    <span className="text-xs text-secondary italic">on v{entry.version} - needs re-checking</span>
                )}
            </div>
        ) : (
            "Add your release check"
        );

    return (
        <TouchTooltip content={<span className="text-sm font-sans">{tooltip}</span>} size="sm" delay={0} closeDelay={0}>
            <span
                className={classNames("shrink-0 flex", className)}
                // The capsule spreads its drag listeners on the root, so a press here would start a drag
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
            >
                <Badge
                    isOneChar
                    size="sm"
                    content={
                        verdict && (
                            <FontAwesomeIcon
                                icon={verdict.stale ? faQuestion : verdict.icon}
                                className="text-[.5rem]"
                            />
                        )
                    }
                    color={verdict?.color ?? "default"}
                    placement="bottom-right"
                    isInvisible={!verdict}
                    showOutline={false}
                    className={classNames("z-0", verdict?.stale && verdict.staleBadge)}
                >
                    <button
                        type="button"
                        aria-label={verdict?.label ?? "Add your release check"}
                        className={classNames(
                            "size-6 rounded-full bg-content1/70 text-xs flex items-center justify-center",
                            "cursor-pointer transition-all hover:bg-content1 hover:text-primary hover:scale-105",
                            verdict?.stale ? staleForegroundClasses : "text-foreground/70",
                            verdict && classNames("ring-2", verdict.ring)
                        )}
                        onClick={onPress}
                    >
                        <FontAwesomeIcon icon={faThumbsUp} />
                    </button>
                </Badge>
            </span>
        </TouchTooltip>
    );
}

type ReleaseCheckButtonProps = {
    entry?: IReleaseCheck;
    /** The slot's latest confirmed card version - anything else the entry answered is stale */
    latestVersion?: SemanticVersion;
    className?: string;
    onPress: () => void;
};
