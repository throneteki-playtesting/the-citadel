import { CSSProperties } from "react";
import { EASE_STANDARD } from "../../../constants";

export const QUARTER_TURN = 90;
const SHAPE_SECONDS = 0.5;
export const SHAPE_TRANSITION = { duration: SHAPE_SECONDS, ease: EASE_STANDARD } as const;
// Eased as SHAPE_TRANSITION is, so what is sized in CSS and what is turned by framer keep step
const SHAPE_EASE_CLASS = "duration-500 ease-[cubic-bezier(0.65,0,0.35,1)]";
export const SHAPE_TRANSITION_CLASS = `transition-[width,height,outline-color] ${SHAPE_EASE_CLASS}`;
export const SIZE_TRANSITION_CLASS = `transition-[width,height] ${SHAPE_EASE_CLASS}`;

// A slot's shapes, sized outright so a slot changing between them can ease. The row's height less the scroller's
// padding (1rem), the frame's (0.5rem), its border (2px) and its header strip (1.75rem) is a vertical card's height
const PORTRAIT_HEIGHT = "(var(--row) - 3.25rem - 2px)";
const LANDSCAPE_WIDTH = "(var(--plot) - 0.5rem - 2px)";
const CARD_RATIO = "240 / 333";

type Shapes = { landscape: CSSProperties; portrait: CSSProperties };
const shapeOf = (shapes: Shapes, isLandscape: boolean) => (isLandscape ? shapes.landscape : shapes.portrait);

const FRAME: Shapes = {
    landscape: { width: "var(--plot)", height: `calc(${LANDSCAPE_WIDTH} * ${CARD_RATIO} + 2.25rem + 2px)` },
    portrait: { width: `calc(${PORTRAIT_HEIGHT} * ${CARD_RATIO} + 0.5rem + 2px)`, height: "100%" }
};
const SLOT: Shapes = {
    landscape: { width: `calc(${LANDSCAPE_WIDTH})`, height: `calc(${LANDSCAPE_WIDTH} * ${CARD_RATIO})` },
    portrait: { width: `calc(${PORTRAIT_HEIGHT} * ${CARD_RATIO})`, height: `calc(${PORTRAIT_HEIGHT})` }
};
// A card drawn turned a quarter has its own width and height the slot's swapped. The blank is drawn vertical, and is
// turned to lie on its side...
const BLANK: Shapes = {
    landscape: { width: SLOT.landscape.height, height: SLOT.landscape.width },
    portrait: SLOT.portrait
};
// ...and a plot is drawn on its side, and is turned to stand upright
const PLOT: Shapes = {
    landscape: SLOT.landscape,
    portrait: { width: SLOT.portrait.height, height: SLOT.portrait.width }
};

export const frameShape = (isLandscape: boolean) => shapeOf(FRAME, isLandscape);
export const slotShape = (isLandscape: boolean) => shapeOf(SLOT, isLandscape);
export const blankShape = (isLandscape: boolean) => shapeOf(BLANK, isLandscape);
export const plotShape = (isUpright: boolean) => shapeOf(PLOT, !isUpright);
