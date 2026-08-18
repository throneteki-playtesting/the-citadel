import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCircleInfo, faMinus, faWrench } from "@fortawesome/free-solid-svg-icons";
import classNames from "classnames";
import { ArtworkPrepFlag, artworkPrepFlags, IArtworkPrep } from "common/models/artwork";
import { artworkPrepMeta } from "../../../constants";
import SectionTitle from "../../../components/sectionTitle";
import { TouchTooltip } from "../../../components/touchTooltip";

// The three things a tweak can be. One control cycling through them beats two checkboxes, where "done"
// without "needed" is a state the pair can express and this one cannot
const modes = {
    unneeded: {
        icon: faMinus,
        hint: "Not needed",
        classes: "border-content3 bg-content2 text-foreground/40 hover:text-foreground/70"
    },
    needed: {
        icon: faWrench,
        hint: "Needed - click to mark done",
        classes: "border-warning/50 bg-warning/10 text-warning"
    },
    done: { icon: faCheck, hint: "Done - click to clear", classes: "border-success/50 bg-success/10 text-success" }
} as const;

type PrepMode = keyof typeof modes;

function modeOf(entry?: IArtworkPrep): PrepMode {
    if (!entry) {
        return "unneeded";
    }
    return entry.done ? "done" : "needed";
}

// Tweaks a piece needs before use. Flagging one never blocks a status, only surfaces the card as needing attention
export default function PrepChecklist({ prep = [], isDisabled, onChange }: PrepChecklistProps) {
    const byFlag = new Map(prep.map((entry) => [entry.flag, entry]));

    // Not needed → needed → done → not needed, so one control covers the whole life of a tweak
    const cycle = (flag: ArtworkPrepFlag) => {
        switch (modeOf(byFlag.get(flag))) {
            case "unneeded":
                onChange([...prep, { flag, done: false }]);
                return;
            case "needed":
                onChange(prep.map((entry) => (entry.flag === flag ? { ...entry, done: true } : entry)));
                return;
            case "done":
                onChange(prep.filter((entry) => entry.flag !== flag));
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <SectionTitle>Preparation</SectionTitle>
            <p className="text-xs text-foreground/50">
                Anything this piece needs before it can go to production. Outstanding work shows on the project's
                artwork overview, but never holds the status back.
            </p>
            <div className="flex flex-wrap gap-2">
                {artworkPrepFlags.map((flag) => {
                    const meta = artworkPrepMeta[flag];
                    const mode = modes[modeOf(byFlag.get(flag))];

                    return (
                        <div
                            key={flag}
                            className={classNames(
                                "flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-md border transition-colors",
                                mode.classes
                            )}
                        >
                            <button
                                type="button"
                                disabled={isDisabled}
                                aria-label={`${meta.label}: ${mode.hint}`}
                                className={classNames(
                                    "flex items-center gap-2 text-sm",
                                    isDisabled ? "cursor-default opacity-60" : "cursor-pointer"
                                )}
                                onClick={() => cycle(flag)}
                            >
                                <FontAwesomeIcon icon={mode.icon} className="w-3.5 text-xs" />
                                <span className="whitespace-nowrap">{meta.label}</span>
                            </button>
                            <TouchTooltip
                                content={
                                    <div className="max-w-56 text-xs flex flex-col gap-1">
                                        <span>{meta.description}</span>
                                        <span className="text-foreground/50">{mode.hint}</span>
                                    </div>
                                }
                            >
                                <span className="inline-flex items-center px-1 py-0.5 text-xs opacity-50 hover:opacity-100 cursor-help">
                                    <FontAwesomeIcon icon={faCircleInfo} />
                                </span>
                            </TouchTooltip>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

type PrepChecklistProps = {
    prep?: IArtworkPrep[];
    isDisabled?: boolean;
    onChange: (prep: IArtworkPrep[]) => void;
};
