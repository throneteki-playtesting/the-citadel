import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { ArtworkType, artworkTypes } from "common/models/slots";
import { artworkTypeDescriptions, artworkTypeIcons, artworkTypeNames } from "../../../constants";
import SectionTitle from "../../../components/sectionTitle";

/**
 * How the artwork is being obtained. Laid out as tiles rather than hidden behind a dropdown, because this
 * one choice decides the whole shape of everything below it - a decision that consequential should be
 * visible with its alternatives, not something you have to open a menu to reconsider.
 */
export default function ArtworkTypePicker({ value, isDisabled, onChange }: ArtworkTypePickerProps) {
    return (
        <div className="flex flex-col gap-2">
            <SectionTitle size="sm">How it's being obtained</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {artworkTypes.map((type) => {
                    const isActive = value === type;

                    return (
                        <button
                            key={type}
                            type="button"
                            disabled={isDisabled}
                            aria-pressed={isActive}
                            onClick={() => onChange(isActive ? undefined : type)}
                            className={classNames(
                                "flex items-center gap-3 p-3 rounded-md border text-left transition-colors",
                                isActive
                                    ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                                    : "border-content3 bg-content1 hover:border-content4",
                                isDisabled ? "cursor-default opacity-60" : "cursor-pointer"
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
                                <span className="text-xs text-foreground/50">{artworkTypeDescriptions[type]}</span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

type ArtworkTypePickerProps = {
    value?: ArtworkType;
    isDisabled?: boolean;
    onChange: (type?: ArtworkType) => void;
};
