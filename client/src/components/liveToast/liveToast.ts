import { createElement, ReactNode } from "react";
import { addToast } from "@heroui/react";
import { LiveToastDescription, LiveToastIcon, LiveToastTitle } from "./liveToastParts";
import { createProgressStore, LIVE_TOAST_CLASSES, LiveToastProgress } from "./liveToastState";

// Spins while `useProgress` reports `working`, then becomes a check or an error in place and leaves on its timeout
export function showLiveToast<P extends LiveToastProgress>({ useProgress, title, description }: LiveToastOptions<P>) {
    let settle!: () => void;
    const promise = new Promise<void>((resolve) => {
        settle = resolve;
    });
    const store = createProgressStore<P>();
    addToast({
        promise,
        classNames: LIVE_TOAST_CLASSES,
        title: createElement(LiveToastTitle<P>, { useProgress, render: title, store, settle }),
        description: description && createElement(LiveToastDescription<P>, { render: description, store }),
        icon: createElement(LiveToastIcon<P>, { store })
    });
}

export type LiveToastOptions<P extends LiveToastProgress> = {
    useProgress: () => P;
    title: (progress: P) => ReactNode;
    description?: (progress: P) => ReactNode;
};
