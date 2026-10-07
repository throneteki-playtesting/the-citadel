import { ReactNode, useLayoutEffect, useRef, useState } from "react";

// A card's badges at the size they are on the card in its stack, grown or shrunk with the card they sit over
export default function ScaledBadges({ referenceWidth, children }: ScaledBadgesProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useLayoutEffect(() => {
        const node = ref.current;
        if (!node || !referenceWidth) {
            return;
        }
        const measure = () => setScale(Math.min(node.offsetWidth, node.offsetHeight) / referenceWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, [referenceWidth]);

    return (
        <div ref={ref} className="absolute inset-0 z-10 origin-top-right" style={{ transform: `scale(${scale})` }}>
            {children}
        </div>
    );
}

type ScaledBadgesProps = {
    /** The width a card is drawn at in its stack, where the badges are their regular size */
    referenceWidth?: number;
    children: ReactNode;
};
