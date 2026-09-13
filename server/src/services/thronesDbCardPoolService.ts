import { convertTDBCard } from "@/utils";
import { dataService, logger } from "@/services";
import { isEnvironment } from "@/env";
import { THRONESDB_URL } from "common/utils";
import { ILabeledCard } from "common/models/cards";
import { Filter, matchesFilter, SingleOrArray, Sort } from "common/types";
import cron from "node-cron";

const POOL_REDIS_KEY = "thronesdb:cardPool";

// Redis is the record; this only saves re-reading it for every search - same shape as DiscordService's emoji cache
const POOL_CACHE_MS = 60_000;

// Only compares the leaf fields the sort actually names - not a full Mongo-style sort, but everything
// the in-memory pool needs (this service has no database to delegate a real `.sort()` to)
function compareBySort<T>(a: T, b: T, orderBy?: Sort<T>): number {
    if (!orderBy) {
        return 0;
    }
    for (const [key, direction] of Object.entries(orderBy)) {
        if (direction === undefined) {
            continue;
        }
        const av = (a as Record<string, unknown>)[key];
        const bv = (b as Record<string, unknown>)[key];

        let cmp: number;
        if (direction !== null && typeof direction === "object") {
            cmp = compareBySort(av, bv, direction as Sort<unknown>);
        } else if (typeof av === "string" && typeof bv === "string") {
            cmp = av.localeCompare(bv);
        } else if (typeof av === "number" && typeof bv === "number") {
            cmp = av - bv;
        } else {
            cmp = av === bv ? 0 : av === undefined ? -1 : bv === undefined ? 1 : 0;
        }

        if (cmp !== 0) {
            return direction === "desc" ? -cmp : cmp;
        }
    }
    return 0;
}

/** Caches the full ThronesDB public card pool - no server-side paging or per-card search there.
 *  Written to Redis only on success, so a failed refresh leaves the last good pool in place. */
class ThronesDbCardPoolService {
    private cache?: { cards: ILabeledCard[]; at: number };

    constructor() {
        // Syncs once on startup, then once a day
        this.refresh();
        if (isEnvironment("staging", "production")) {
            cron.schedule("0 0 * * *", () => this.refresh());
            logger.info("[ThronesDB] Daily card pool sync scheduled");
        }
    }

    public async refresh() {
        try {
            const response = await fetch(`${THRONESDB_URL}/api/public/cards/`);
            if (!response.ok) {
                throw new Error(`Failed to fetch ThronesDB card pool: ${response.statusText}`);
            }

            const json = await response.json();
            const cards = json.map(convertTDBCard);

            await dataService.redis.set(POOL_REDIS_KEY, JSON.stringify(cards));
            this.cache = { cards, at: Date.now() };
            logger.info(`[ThronesDB] Loaded ${cards.length} cards into the pool`);
        } catch (err) {
            logger.error(new Error("[ThronesDB] Failed to refresh card pool", { cause: err }));
        }
    }

    private async getPool(): Promise<ILabeledCard[]> {
        if (this.cache && Date.now() - this.cache.at < POOL_CACHE_MS) {
            return this.cache.cards;
        }

        let cards: ILabeledCard[] = this.cache?.cards ?? [];
        try {
            const raw = await dataService.redis.get(POOL_REDIS_KEY);
            cards = raw ? JSON.parse(String(raw)) : cards;
        } catch (err) {
            logger.warn(new Error("[ThronesDB] Failed to read card pool from redis", { cause: err }));
        }

        this.cache = { cards, at: Date.now() };
        return cards;
    }

    public async search(
        filter?: SingleOrArray<Filter<ILabeledCard>>,
        orderBy?: Sort<ILabeledCard>,
        page: number = 1,
        perPage: number = 20
    ): Promise<{ items: ILabeledCard[]; total: number }> {
        const pool = await this.getPool();
        const filters = filter === undefined ? undefined : Array.isArray(filter) ? filter : [filter];

        const matched = pool
            .filter((card) => !filters || filters.some((f) => matchesFilter(card, f)))
            .sort((a, b) => compareBySort(a, b, orderBy));

        const start = (page - 1) * perPage;
        return { items: matched.slice(start, start + perPage), total: matched.length };
    }
}

export default ThronesDbCardPoolService;
