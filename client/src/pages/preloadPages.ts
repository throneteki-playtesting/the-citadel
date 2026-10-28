import { likelyNextPages } from ".";

let hasStarted = false;

function whenIdle(callback: () => void) {
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(callback, { timeout: 3000 });
    } else {
        setTimeout(callback, 200);
    }
}

/** Fetches the code of the pages likely to be opened next, one at a time in idle moments once the page on show has
 *  settled - the same `import()` each lazy page makes, so it is already there when the link is followed. */
export default function preloadPages() {
    if (hasStarted) {
        return;
    }
    hasStarted = true;
    const queue = [...likelyNextPages];
    const next = () => {
        const load = queue.shift();
        if (load) {
            whenIdle(() => {
                // A page failing to fetch now just loads when it's asked for, as it would have anyway
                load()
                    .catch(() => undefined)
                    .finally(next);
            });
        }
    };
    next();
}
