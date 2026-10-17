import { useCallback, useRef, useState } from "react";
import { deriveFields } from "common/designGuidelines/deriveFields";
import { IRewardDownsideOption } from "common/models/settings";

type Selections = { rewards: string[]; downsides: string[] };

function keywordsOf(text: string | undefined): Set<string> {
    return new Set(deriveFields(text ?? "").keywords.map(({ keyword }) => keyword));
}

// Adds the options a card's keywords stand for as they appear in its text, and removes only those when they go.
// `marks` maps each such option to its keywords; `reset` starts from the keywords a suggestion already has.
export function useKeywordSelections({
    rewardOptions,
    downsideOptions,
    selectedIds,
    updateSelections
}: {
    rewardOptions: IRewardDownsideOption[];
    downsideOptions: IRewardDownsideOption[];
    /** Every reward and downside currently selected */
    selectedIds: string[];
    updateSelections: (update: (selections: Selections) => Selections) => void;
}) {
    const [marks, setMarks] = useState<Record<string, string[]>>({});
    const marksRef = useRef(marks);
    // Options the designer unchecked, put back on the next text edit if their keyword is still there
    const unchecked = useRef(new Set<string>());
    const text = useRef<string | undefined>(undefined);
    const keywords = useRef<Set<string>>(new Set());

    // Read through a ref so the callbacks below stay stable
    const latest = useRef({ rewardOptions, downsideOptions, selectedIds, updateSelections });
    latest.current = { rewardOptions, downsideOptions, selectedIds, updateSelections };

    const commitMarks = useCallback((next: Record<string, string[]>) => {
        marksRef.current = next;
        setMarks(next);
    }, []);

    const reset = useCallback(
        (initialText: string | undefined) => {
            text.current = initialText;
            keywords.current = keywordsOf(initialText);
            unchecked.current = new Set();
            commitMarks({});
        },
        [commitMarks]
    );

    /** Called with the card's text and the keywords found in it, whenever the card is edited */
    const onCardTextChange = useCallback(
        (nextText: string | undefined, keywordNames: string[]) => {
            if (nextText === text.current) {
                return;
            }
            text.current = nextText;
            const before = keywords.current;
            const current = new Set(keywordNames);
            keywords.current = current;
            const added = [...current].filter((keyword) => !before.has(keyword));
            const removed = [...before].filter((keyword) => !current.has(keyword));
            if (added.length === 0 && removed.length === 0 && unchecked.current.size === 0) {
                return;
            }

            const { rewardOptions, downsideOptions, selectedIds, updateSelections } = latest.current;
            const nextMarks = { ...marksRef.current };
            const drops = new Set<string>();
            const adds: Selections = { rewards: [], downsides: [] };
            for (const [list, options] of [
                ["rewards", rewardOptions],
                ["downsides", downsideOptions]
            ] as const) {
                for (const option of options) {
                    const linked = option.keywords.filter((keyword) => current.has(keyword));
                    const wasUnchecked = unchecked.current.delete(option.id);
                    if (nextMarks[option.id]) {
                        if (linked.length === 0) {
                            delete nextMarks[option.id];
                            drops.add(option.id);
                        } else {
                            nextMarks[option.id] = linked;
                        }
                    } else if (
                        linked.length > 0 &&
                        (wasUnchecked || option.keywords.some((keyword) => added.includes(keyword))) &&
                        option.enabled &&
                        !selectedIds.includes(option.id)
                    ) {
                        nextMarks[option.id] = linked;
                        adds[list].push(option.id);
                    }
                }
            }

            commitMarks(nextMarks);
            updateSelections(({ rewards, downsides }) => ({
                rewards: [
                    ...rewards.filter((id) => !drops.has(id)),
                    ...adds.rewards.filter((id) => !rewards.includes(id))
                ],
                downsides: [
                    ...downsides.filter((id) => !drops.has(id)),
                    ...adds.downsides.filter((id) => !downsides.includes(id))
                ]
            }));
        },
        [commitMarks]
    );

    // Checking an unchecked option again by hand makes it the designer's own
    const settle = useCallback(
        (options: IRewardDownsideOption[], next: string[]) => {
            const nextMarks = { ...marksRef.current };
            let changed = false;
            for (const { id } of options) {
                if (nextMarks[id] && !next.includes(id)) {
                    delete nextMarks[id];
                    unchecked.current.add(id);
                    changed = true;
                } else if (unchecked.current.has(id) && next.includes(id)) {
                    unchecked.current.delete(id);
                }
            }
            if (changed) {
                commitMarks(nextMarks);
            }
        },
        [commitMarks]
    );
    const settleRewards = useCallback((next: string[]) => settle(latest.current.rewardOptions, next), [settle]);
    const settleDownsides = useCallback((next: string[]) => settle(latest.current.downsideOptions, next), [settle]);

    return { marks, reset, onCardTextChange, settleRewards, settleDownsides };
}
