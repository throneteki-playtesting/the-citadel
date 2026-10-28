import { useEffect, useState } from "react";
import { Spinner } from "@heroui/react";
import Reveal from "./reveal";

// Most pages draw well within this, so most loads never show anything at all - nothing to flash in and straight back out
const SHOW_AFTER_MS = 300;
// A load passes through several loaders in turn - signing in, then the record a page is gated on, then its code - each
// a new instance. One taking over this soon after the last is the same wait, so it carries on that wait's clock rather
// than starting its own: otherwise every hand-over would blank the spinner out and restart the delay.
const HANDOVER_MS = 100;
const LOADER_CLASS = "flex flex-col items-center gap-3 pt-24 sm:pt-32";
let waitingSince = 0;
let lastLoaderGoneAt = 0;
// The next loader renders before the last one's cleanup runs, in the same commit, so one still mounted is a hand-over too
let mountedLoaders = 0;

function delayRemaining() {
    const now = performance.now();
    if (mountedLoaders === 0 && now - lastLoaderGoneAt > HANDOVER_MS) {
        waitingSince = now;
    }
    return Math.max(0, SHOW_AFTER_MS - (now - waitingSince));
}

/**
 * Every page's loading state before it can draw - while signing in, while its code arrives, and while the record it is
 * gated on loads. Nothing at first, then a spinner if it's taking a while. It always ends: a failure becomes the
 * route's error (`RouteError`) or the page's own, and a query which never answers times out (see `api/index.ts`).
 */
export default function PageLoader() {
    const [delay] = useState(delayRemaining);
    const [isShown, setIsShown] = useState(delay === 0);
    useEffect(() => {
        mountedLoaders++;
        const timer = setTimeout(() => setIsShown(true), delay);
        return () => {
            mountedLoaders--;
            clearTimeout(timer);
            lastLoaderGoneAt = performance.now();
        };
    }, [delay]);

    if (!isShown) {
        return null;
    }
    const content = (
        <>
            <Spinner size="lg" aria-label="Loading" />
            <span className="font-cinzel tracking-widest text-sm text-foreground/60">Loading...</span>
        </>
    );
    // Carrying on a wait which was already showing, it stays put rather than fading in a second time
    return delay === 0 ? (
        <div className={LOADER_CLASS}>{content}</div>
    ) : (
        <Reveal direction={null} className={LOADER_CLASS}>
            {content}
        </Reveal>
    );
}
