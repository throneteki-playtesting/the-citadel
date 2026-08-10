import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { ArtworkType, artworkTypes } from "common/models/slots";
import { artworkTypeDescriptions, artworkTypeIcons, artworkTypeNames } from "../../../constants";
import SectionTitle from "../../../components/sectionTitle";

/**
 * How the artwork is being obtained. Laid out as tiles rather than hidden behind a dropdown, because this
 * one choice decides the whole shape of everything below it - a decision that consequential should be
 * visible with its alternatives, not something you have to open a menu to reconsider.
 */
export default function ArtworkTypePicker({ value, isDisabled, isLocked, onChange }: ArtworkTypePickerProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    // Stacked, three tiles answering a settled question is most of a screen. sm: opens them all again
    const isCollapsed = !!value && !isExpanded;
    const canPick = !isDisabled && !isLocked;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <SectionTitle size="sm" className="flex-1 min-w-0">
                    How it's being obtained
                </SectionTitle>
                {value && (
                    <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        aria-label={isCollapsed ? "Show the other options" : "Hide the other options"}
                        className="sm:hidden shrink-0 grid place-items-center size-6 text-foreground/40 hover:text-primary"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        <FontAwesomeIcon
                            icon={faChevronDown}
                            className={classNames("transition-transform duration-300", !isCollapsed && "rotate-180")}
                        />
                    </button>
                )}
            </div>
            {isLocked && (
                <p className="text-xs text-foreground/50">
                    The artwork is in hand, so how it was obtained is settled. Move the status back to change it.
                </p>
            )}
            <div className="grid grid-cols-1 -mb-2 sm:grid-cols-3 sm:gap-2 sm:mb-0">
                {artworkTypes.map((type) => {
                    const isActive = value === type;

                    // The 0fr/1fr row is the whole fold, and each tile carries the gap as its own padding
                    // inside the clip, so folding away takes that spacing with it
                    return (
                        <div
                            key={type}
                            className={classNames(
                                "grid transition-[grid-template-rows] duration-300 ease-in-out sm:grid-rows-[1fr]",
                                isCollapsed && !isActive ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
                            )}
                        >
                            <div className="min-h-0 overflow-hidden">
                                <div className="h-full pb-2 sm:pb-0">
                                    <button
                                        type="button"
                                        disabled={!canPick}
                                        aria-pressed={isActive}
                                        onClick={() => {
                                            onChange(isActive ? undefined : type);
                                            setIsExpanded(false);
                                        }}
                                        className={classNames(
                                            "w-full h-full flex items-center gap-3 p-3 rounded-md border text-left transition-colors",
                                            isActive
                                                ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                                                : "border-content3 bg-content1",
                                            canPick ? "cursor-pointer hover:border-content4" : "cursor-default",
                                            // Only the unchosen dim - the chosen one is still the answer
                                            !canPick && !isActive && "opacity-50"
                                        )}
                                    >
                                        <FontAwesomeIcon
                                            icon={artworkTypeIcons[type]}
                                            className={classNames(
                                                "mt-0.5 shrink-0 text-2xl",
                                                isActive ? "text-primary" : "text-foreground/30"
                                            )}
                                        />
                                        <div className="min-w-0 flex flex-col gap-0.5">
                                            <span
                                                className={classNames(
                                                    "font-cinzel tracking-wide text-sm",
                                                    isActive ? "text-primary" : "text-foreground/80"
                                                )}
                                            >
                                                {artworkTypeNames[type]}
                                            </span>
                                            <span className="text-xs text-foreground/50">
                                                {artworkTypeDescriptions[type]}
                                            </span>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

type ArtworkTypePickerProps = {
    value?: ArtworkType;
    isDisabled?: boolean;
    /** The artwork is confirmed, so how it was obtained is settled - only the chosen tile stays lit */
    isLocked?: boolean;
    onChange: (type?: ArtworkType) => void;
};
