import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import classNames from "classnames";

type Ghost = { id: number; nodes: Node[] };

/** Fades to new content whenever `contentKey` changes - updated in place, with a snapshot fading out over it */
export default function Crossfade({
    contentKey,
    className,
    children
}: {
    contentKey: string;
    className?: string;
    children: ReactNode;
}) {
    const contentRef = useRef<HTMLDivElement>(null);
    const [previousKey, setPreviousKey] = useState(contentKey);
    const [ghost, setGhost] = useState<Ghost>();
    // Copied before the update reaches the page, so the snapshot is exactly what was on screen
    if (contentKey !== previousKey) {
        setPreviousKey(contentKey);
        const element = contentRef.current;
        if (element) {
            const nodes = Array.from(element.childNodes, (node) => node.cloneNode(true));
            setGhost((current) => ({ id: (current?.id ?? 0) + 1, nodes }));
        }
    }

    return (
        <div className={classNames("relative", className)}>
            <div ref={contentRef}>{children}</div>
            {ghost && <FadingSnapshot key={ghost.id} nodes={ghost.nodes} onFaded={() => setGhost(undefined)} />}
        </div>
    );
}

// A copy of the DOM rather than a second render, which would mount and measure everything over again
function FadingSnapshot({ nodes, onFaded }: { nodes: Node[]; onFaded: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        ref.current?.replaceChildren(...nodes);
    }, [nodes]);
    return (
        <div
            ref={ref}
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-250 ease-in starting:opacity-100"
            onTransitionEnd={(e) => {
                if (e.target === e.currentTarget) {
                    onFaded();
                }
            }}
        />
    );
}
