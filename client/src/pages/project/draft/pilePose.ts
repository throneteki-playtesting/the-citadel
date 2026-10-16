import { EASE_STANDARD } from "../../../constants";
import { QUARTER_TURN } from "./slotShape";

export const LIT = "brightness(1)";
// How a card travels between a modal and its pile, whichever way it goes
export const FLIGHT = { duration: 0.45, ease: EASE_STANDARD } as const;

export type Pose = { cx: number; cy: number; width: number; rotate: number; filter: string; zIndex: string };

// Where a card rests in its pile, read off the stack itself - box, offset and tilt, shading, and what it lies under
export function pileCardPose(pile: HTMLElement, stackIndex: number): Pose {
    const box = pile.getBoundingClientRect();
    const card = pile.querySelector<HTMLElement>(`[data-stack-index="${stackIndex}"]`);
    const style = card ? getComputedStyle(card) : undefined;
    const matrix = new DOMMatrix(style?.transform ?? "none");
    return {
        cx: box.left + box.width / 2 + matrix.e,
        cy: box.top + box.height / 2 + matrix.f,
        width: box.width,
        rotate: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
        filter: style && style.filter !== "none" ? style.filter : LIT,
        zIndex: card?.style.zIndex ?? ""
    };
}

// An upright plot is its landscape card turned a quarter anticlockwise, so one becomes the other by turning back

// How far a plot is turned on its way from the orientation it is drawn in to the one it will be in - none for any other card
export function plotTurn(isPlot: boolean, isFromUpright: boolean, isToUpright: boolean) {
    if (!isPlot || isFromUpright === isToUpright) {
        return 0;
    }
    return isFromUpright ? QUARTER_TURN : -QUARTER_TURN;
}

export function towardsPile(rect: DOMRect, pose: Pose, turn = 0) {
    return {
        x: pose.cx - (rect.left + rect.width / 2),
        y: pose.cy - (rect.top + rect.height / 2),
        scale: pose.width / (turn === 0 ? rect.width : rect.height),
        rotate: pose.rotate + turn,
        filter: pose.filter
    };
}
