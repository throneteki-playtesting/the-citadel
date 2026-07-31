import { useRef } from "react";

type SwipeDirection = "up" | "down" | "left" | "right";

export default function useSwipe(
    onSwipe: (direction: SwipeDirection) => void,
    { tolerance = 50, directions }: { tolerance?: number; directions?: SwipeDirection[] } = {}
) {
    const startX = useRef<number>(0);
    const startY = useRef<number>(0);

    return {
        onTouchStart: (e: React.TouchEvent) => {
            startX.current = e.touches[0].clientX;
            startY.current = e.touches[0].clientY;
        },
        onTouchEnd: (e: React.TouchEvent) => {
            const diffX = e.changedTouches[0].clientX - startX.current;
            const diffY = e.changedTouches[0].clientY - startY.current;

            let direction: SwipeDirection;
            if (Math.abs(diffX) > Math.abs(diffY)) {
                if (Math.abs(diffX) <= tolerance) {
                    return;
                }
                direction = diffX < 0 ? "left" : "right";
            } else {
                if (Math.abs(diffY) <= tolerance) {
                    return;
                }
                direction = diffY < 0 ? "up" : "down";
            }

            if (directions && !directions.includes(direction)) {
                return;
            }

            e.preventDefault();
            onSwipe(direction);
        }
    };
}
