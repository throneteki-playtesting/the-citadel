import { ReactNode, useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { LiveToastProgress, liveToastTextClasses, ProgressStore } from "./liveToastState";

export function LiveToastTitle<P extends LiveToastProgress>({ useProgress, render, store, settle }: TitleProps<P>) {
    const progress = useProgress();
    useLayoutEffect(() => store.set(progress), [store, progress]);
    useEffect(() => {
        if (progress.status !== "working") {
            settle();
        }
    }, [progress.status, settle]);
    return (
        <span data-live-toast={progress.status} className={liveToastTextClasses[progress.status]}>
            {render(progress)}
        </span>
    );
}

export function LiveToastDescription<P extends LiveToastProgress>({ render, store }: ReaderProps<P>) {
    const progress = useSyncExternalStore(store.subscribe, store.get);
    return progress && <span className={liveToastTextClasses[progress.status]}>{render(progress)}</span>;
}

export function LiveToastIcon<P extends LiveToastProgress>({ store }: { store: ProgressStore<P> }) {
    const progress = useSyncExternalStore(store.subscribe, store.get);
    return progress?.status === "danger" ? (
        <FontAwesomeIcon icon={faCircleXmark} className="text-danger" />
    ) : (
        <FontAwesomeIcon icon={faCircleCheck} className="text-success" />
    );
}

type ReaderProps<P extends LiveToastProgress> = {
    render: (progress: P) => ReactNode;
    store: ProgressStore<P>;
};

type TitleProps<P extends LiveToastProgress> = ReaderProps<P> & {
    useProgress: () => P;
    settle: () => void;
};
