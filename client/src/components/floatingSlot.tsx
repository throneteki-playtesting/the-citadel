import { useFloatingSlot } from "../hooks/useFloatingSlots";

// Rendered beside a floating button at the bottom right, so whatever else floats there leaves its place
export default function FloatingSlot({ index }: { index: number }) {
    useFloatingSlot(index);
    return null;
}
