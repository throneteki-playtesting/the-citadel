import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock, faRepeat, faXmark } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { ArtworkType, artworkTypes } from "common/models/slots";
import { artworkTypeDescriptions, artworkTypeIcons, artworkTypeNames } from "../../../constants";
import SectionTitle from "../../../components/sectionTitle";

// How the artwork is being obtained. Tiles rather than a dropdown - this one choice shapes everything below it
export default function ArtworkTypePicker({ value, isDisabled, isLocked, onChange }: ArtworkTypePickerProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    // Stacked, three tiles answering a settled question is most of a screen. sm: opens them all again
    const isCollapsed = !!value && !isExpanded;
    const canPick = !isDisabled && !isLocked;

    return (
        <div className="flex flex-col gap-2">
            <SectionTitle size="sm">Artwork Acquisition</SectionTitle>
            <div className="grid grid-cols-1 -mb-2 sm:grid-cols-3 sm:gap-2 sm:mb-0">
                {artworkTypes.map((type) => {
                    const isActive = value === type;
                    return (
                        <div
                            key={type}
                            className={classNames(
                                "grid transition-[grid-template-rows] duration-300 ease-in-out sm:grid-rows-[1fr]",
                                isCollapsed && !isActive ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
                            )}
                        >
                            <div className="min-h-0 overflow-hidden">
                                <div className="relative h-full pb-2 sm:pb-0">
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
                                            isActive ? "border-primary bg-primary/10" : "border-content3 bg-content1",
                                            canPick ? "cursor-pointer" : "cursor-default",
                                            !isLocked &&
                                                (canPick && isActive
                                                    ? "hover:border-primary/50"
                                                    : "hover:border-content4"),
                                            // Only the unchosen dim - the chosen one is still the answer
                                            !canPick && !isActive && "opacity-50 cursor-not-allowed",
                                            // Room for whichever corner control the chosen tile is carrying
                                            isActive && isLocked && "pr-9",
                                            isActive && canPick && "pr-9 sm:pr-3"
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
                                    {isActive && isLocked && (
                                        <span
                                            aria-label="Artwork acquisition method has been locked in"
                                            className="absolute top-1.5 right-1.5 grid place-items-center size-6 text-primary/60"
                                        >
                                            <FontAwesomeIcon icon={faLock} />
                                        </span>
                                    )}
                                    {isActive && canPick && (
                                        <button
                                            type="button"
                                            aria-expanded={isExpanded}
                                            aria-label={
                                                isExpanded
                                                    ? "Keep this way of obtaining the artwork"
                                                    : "Change how this artwork is being obtained"
                                            }
                                            className="sm:hidden absolute top-1.5 right-1.5 grid place-items-center size-6 rounded-md text-primary/60 hover:text-primary"
                                            onClick={() => setIsExpanded(!isExpanded)}
                                        >
                                            <FontAwesomeIcon icon={isExpanded ? faXmark : faRepeat} />
                                        </button>
                                    )}
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
