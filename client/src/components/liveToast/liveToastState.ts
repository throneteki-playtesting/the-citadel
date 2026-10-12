import { isEqual } from "lodash-es";

export type LiveToastStatus = "working" | "success" | "danger";

/** What a live toast follows - whatever else it carries is for its own title and description to use */
export type LiveToastProgress = { status: LiveToastStatus };

// The toast's colour follows its status through :has(), as HeroUI fixes a toast's colour when it opens
export const LIVE_TOAST_CLASSES = {
    base: "has-[[data-live-toast=success]]:border-success-100 has-[[data-live-toast=success]]:bg-success-50 has-[[data-live-toast=danger]]:border-danger-100 has-[[data-live-toast=danger]]:bg-danger-50"
};

export const liveToastTextClasses: Record<LiveToastStatus, string> = {
    working: "",
    success: "text-success-600",
    danger: "text-danger-600"
};

// The title follows the progress from the start and tells the description and icon, which come into being later
export function createProgressStore<P extends LiveToastProgress>() {
    let progress: P | undefined;
    const listeners = new Set<() => void>();
    return {
        get: () => progress,
        set(next: P) {
            if (isEqual(next, progress)) {
                return;
            }
            progress = next;
            listeners.forEach((listener) => listener());
        },
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => void listeners.delete(listener);
        }
    };
}

export type ProgressStore<P extends LiveToastProgress> = ReturnType<typeof createProgressStore<P>>;
