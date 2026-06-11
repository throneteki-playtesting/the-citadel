import { useRef } from "react";

type SwipeDirection = "up" | "down" | "left" | "right";

export default function useSwipe(onSwipe: (direction: SwipeDirection) => void, tolerance = 50) {
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

            if (Math.abs(diffX) > Math.abs(diffY)) {
                if (Math.abs(diffX) > tolerance) {
                    e.preventDefault();
                    onSwipe(diffX < 0 ? "left" : "right");
                }
            } else if (Math.abs(diffY) > tolerance) {
                e.preventDefault();
                onSwipe(diffY < 0 ? "up" : "down");
            }
        }
    };
};