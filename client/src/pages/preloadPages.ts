import { likelyNextPages } from ".";

let hasStarted = false;

function whenIdle(callback: () => void) {
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(callback, { timeout: 3000 });
    } else {
        setTimeout(callback, 200);
    }
}

/**
 * Fetches the code of the pages somebody is likely to open next, once the page they're on has settled - one at a time,
 * each in an idle moment after the last has arrived, so it never competes with what they're actually doing. Each is
 * the same `import()` its lazy page makes, so the module is simply already there when the link is followed. Under
 * Vite's dev server this is also what has it compile those pages in the background, rather than on the click.
 */
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
