export type StackZone = "left" | "centre" | "right";
// Which way a shuffled card flies out: 1 to the right, -1 to the left
export type ShuffleDirection = 1 | -1;

// How far a card flies out, as a share of its own width
export const SHUFFLE_REACH = 1.12;

// Where across a pile a pointer is - halves, or thirds when the middle is kept for whatever sits under it
export function zoneAt(x: number, { left, width }: { left: number; width: number }, hasCentre: boolean): StackZone {
    const share = width > 0 ? (x - left) / width : 0.5;
    if (hasCentre) {
        return share < 1 / 3 ? "left" : share > 2 / 3 ? "right" : "centre";
    }
    return share < 0.5 ? "left" : "right";
}

// A press on the right moves the selection back, as the pile has always done; one on the left moves it forward
export const SHUFFLE_STEP: Record<Exclude<StackZone, "centre">, 1 | -1> = { left: 1, right: -1 };
// And the card flies out on the side which was pressed
export const SHUFFLE_SIDE: Record<Exclude<StackZone, "centre">, ShuffleDirection> = { left: -1, right: 1 };

// The side a card flies out on: the one asked for if it has the room to, else the one which does - and with room on
// neither, whichever has more
export function flightSide(
    preferred: ShuffleDirection | undefined,
    roomLeft: number,
    roomRight: number,
    needed: number
) {
    const room = (side: ShuffleDirection) => (side > 0 ? roomRight : roomLeft);
    if (preferred && room(preferred) >= needed) {
        return preferred;
    }
    if (preferred && room(-preferred as ShuffleDirection) >= needed) {
        return -preferred as ShuffleDirection;
    }
    return roomRight >= roomLeft ? 1 : -1;
}
