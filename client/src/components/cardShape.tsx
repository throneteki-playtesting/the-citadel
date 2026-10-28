import { ReactNode } from "react";
import classNames from "classnames";

// CardPreview rounds its corners by 12 of its base width (240 across, or 333 for a plot lying down)
const VERTICAL_RADIUS_CQW = (12 / 240) * 100;
const HORIZONTAL_RADIUS_CQW = (12 / 333) * 100;

/** A layer over a card with the card's own corners, so a ring or tint drawn on it follows the card exactly rather than a
 *  guess at its radius. Sized from the card beneath it, as the corner badges are. */
export default function CardShape({ isPlot, className, children }: CardShapeProps) {
    return (
        <span aria-hidden className="pointer-events-none absolute inset-0 block [container-type:size]">
            <span
                className={classNames("grid size-full place-items-center", className)}
                style={{ borderRadius: `${isPlot ? HORIZONTAL_RADIUS_CQW : VERTICAL_RADIUS_CQW}cqw` }}
            >
                {children}
            </span>
        </span>
    );
}

type CardShapeProps = {
    isPlot: boolean;
    className?: string;
    children?: ReactNode;
};
