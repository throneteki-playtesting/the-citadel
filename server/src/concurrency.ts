import { AsyncLocalStorage } from "async_hooks";
import { Mutex } from "async-mutex";
import { compare } from "semver";
import { SemanticVersion } from "common/utils";

// One lock for each key, made when first asked for - so each card, slot or project is done by one at a time while
// different ones go side by side
export function keyedMutex<K>(keyOf: (key: K) => string) {
    const mutexes = new Map<string, Mutex>();
    return (key: K) => {
        const id = keyOf(key);
        if (!mutexes.has(id)) {
            mutexes.set(id, new Mutex());
        }
        return mutexes.get(id)!;
    };
}

const turns = new AsyncLocalStorage<<V>(step: () => Promise<V>) => Promise<V>>();

// The step which creates something whose place matters - a thread, a message, an issue. Where it is called from work run
// by `inOrder`, it waits until every item before it has done the same; anywhere else it simply runs
export function orderedStep<V>(step: () => Promise<V>): Promise<V> {
    return (turns.getStore() ?? ((run) => run()))(step);
}

// Starts all of the items at once. Whatever each does besides its `orderedStep` is in parallel - the steps alone
// are taken in the order of the items, whether or not an item has one, finishes first, or fails
export function inOrder<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
    let previous: Promise<unknown> = Promise.resolve();
    return Promise.all(
        items.map(async (item) => {
            const before = previous;
            let done!: () => void;
            previous = new Promise<void>((resolve) => (done = resolve));
            const turn = async <V>(step: () => Promise<V>) => {
                await before;
                try {
                    return await step();
                } finally {
                    done();
                }
            };
            try {
                return await turns.run(turn, () => work(item));
            } finally {
                await before;
                done();
            }
        })
    );
}

// Runs `work` for every item at once, each `orderedStep` in the items' order. Locks are held for the whole run and taken
// in that same order, so overlapping runs never wait on each other. Results come back in the order given
export async function syncInOrder<T, R>(
    items: T[],
    {
        key,
        order,
        work
    }: {
        key: (item: NoInfer<T>) => string;
        order?: (a: NoInfer<T>, b: NoInfer<T>) => number;
        work: (item: NoInfer<T>) => Promise<R>;
    }
): Promise<R[]> {
    const sorted = order ? [...items].sort(order) : items;
    const releases: (() => void)[] = [];
    try {
        for (const item of sorted) {
            releases.push(await locks(key(item)).acquire());
        }
        const results = new Map(
            (await inOrder(sorted, async (item) => [item, await work(item)] as const)).map(([item, result]) => [
                item,
                result
            ])
        );
        return items.map((item) => results.get(item)!);
    } finally {
        releases.forEach((release) => release());
    }
}

const locks = keyedMutex<string>((key) => key);

export const byNumber = (a: number, b: number) => a - b;
export const byVersion = (a: SemanticVersion, b: SemanticVersion) => compare(a, b);
type CardRef = { project: number; number: number; version: SemanticVersion };

// A card's place among cards: its project, then its number, then its version
export const byCard = (a: CardRef, b: CardRef) =>
    byNumber(a.project, b.project) || byNumber(a.number, b.number) || byVersion(a.version, b.version);
export const cardLock = ({ project, number, version }: CardRef) => `card|${project}|${number}|${version}`;

type Emitter = { start(): void; error(message: string): void };

// What the forum and issue syncs share: every emitter is started before the context resolves, so a context which fails
// fails them all properly - then the items are done at once, in order, each reporting through its own emitter
export async function syncBatch<T, C, E extends Emitter, R = T>(
    items: T[],
    {
        emitterFor,
        context,
        key,
        order,
        work
    }: {
        emitterFor: (item: NoInfer<T>) => E;
        context: () => C | Promise<C>;
        key: (item: NoInfer<T>) => string;
        order?: (a: NoInfer<T>, b: NoInfer<T>) => number;
        work: (item: NoInfer<T>, context: C, emitter: E) => Promise<R>;
    }
): Promise<R[]> {
    const emitters = new Map(items.map((item) => [item, emitterFor(item)]));
    emitters.forEach((emitter) => emitter.start());
    try {
        const resolved = await context();
        return await syncInOrder(items, {
            key,
            order,
            work: async (item) => {
                const result = await work(item, resolved, emitters.get(item)!);
                emitters.delete(item);
                return result;
            }
        });
    } catch (err) {
        // Only reached by the context or the locks - an item's own failure is handled by its work
        emitters.forEach((emitter) => emitter.error("Failure"));
        throw err;
    }
}
