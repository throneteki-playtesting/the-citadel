import puppeteer, { Page, Viewport } from "puppeteer";
import { dataService, logger } from "@/services";
import { asArray } from "common/utils";
import { SingleOrArray } from "common/types";
import { randomUUID, UUID } from "crypto";
import { BatchRenderJob, BatchRenderJobOptions, RenderType, SingleRenderJob, SingleRenderJobOptions } from "@/types";
import { IRenderCard } from "common/models/cards";

type PNGResponse = { id: UUID, card: IRenderCard, buffer: Buffer<ArrayBufferLike> };

export async function asPNG(card: IRenderCard, options?: SingleRenderJobOptions): Promise<PNGResponse>;
export async function asPNG(cards: IRenderCard[], options?: SingleRenderJobOptions): Promise<PNGResponse[]>;
export async function asPNG(data: SingleOrArray<IRenderCard>, options?: SingleRenderJobOptions) {
    const cards = asArray(data);
    if (!cards) {
        return undefined;
    }
    if (cards.length === 0) {
        return [];
    }
    const browser = await launchPuppeteer({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1.25
    });
    const page = (await browser.pages())[0] ?? await browser.newPage();
    const job = await createJob("single", cards, options);
    try {
        attachDiagnostics(page, job.id);
        await applyInternalAuthHeaders(page);
        await page.goto(`${process.env.CLIENT_HOST}/render?id=${job.id}`, { waitUntil: "networkidle0" });
        await page.evaluate(() => document.fonts.ready);
        await logFontStatus(page, job.id);
        await checkRenderError(page);

        const responses: PNGResponse[] = [];
        for (const { id, card } of job.data) {
            const element = await page.$(`[data-card-id="${id}"]`);
            const buffer = await element.screenshot({ optimizeForSpeed: true, type: "png" });

            responses.push({
                id,
                card,
                buffer
            });
        }
        return Array.isArray(data) ? responses : responses[0];
    } finally {
        await page.close();
        await browser.close();
    }
}

export async function asPDF(data: SingleOrArray<IRenderCard>, options?: BatchRenderJobOptions) {
    const cards = asArray(data);
    const job = await createJob("batch", cards, options);
    const browser = await launchPuppeteer({
        width: 794,
        height: 1124 // For some reason, puppeteer wants this as 1124, rather than the 1122 that it SHOULD be for A4 *shrug*
    });
    const page = (await browser.pages())[0] ?? await browser.newPage();

    try {
        attachDiagnostics(page, job.id);
        await applyInternalAuthHeaders(page);
        await page.goto(`${process.env.CLIENT_HOST}/render?id=${job.id}`, { waitUntil: "networkidle0" });
        await page.evaluate(() => document.fonts.ready);
        await logFontStatus(page, job.id);
        await checkRenderError(page);

        const buffer = await page.pdf({ printBackground: true, format: "A4" });

        return buffer;
    } finally {
        await page.close();
        await browser.close();
    }
}
function attachDiagnostics(page: Page, jobId: UUID) {
    logger.info(`[render ${jobId}] diagnostics attached`);
    page.on("response", (response) => {
        const url = response.url();
        if (url.endsWith(".js") && url.includes("/assets/")) {
            const headers = response.headers();
            logger.info(`[render ${jobId}] loaded bundle: ${url} (cache-control: ${headers["cache-control"]}, age: ${headers.age}, last-modified: ${headers["last-modified"]}, etag: ${headers.etag})`);
        }
    });
    page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warn") {
            logger.warn(`[render ${jobId}] console.${msg.type()}: ${msg.text()}`);
        }
    });
    page.on("pageerror", (err) => {
        logger.error(new Error(`[render ${jobId}] page error`, { cause: err }));
    });
    page.on("requestfailed", (request) => {
        logger.warn(`[render ${jobId}] request failed: ${request.url()} (${request.failure()?.errorText})`);
    });
    page.on("response", (response) => {
        const url = response.url();
        const isFont = url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com") || url.includes(".ttf") || url.includes(".woff");
        if (isFont && !response.ok()) {
            logger.warn(`[render ${jobId}] font request returned ${response.status()}: ${url}`);
        }
    });
}

async function logFontStatus(page: Page, jobId: UUID) {
    // "unloaded" just means unused so far (most of the declared @font-face weights never get
    // triggered by a given card) - only "error" indicates an actual failed fetch/parse. Note this
    // only catches failures where the @font-face rule itself registered (the stylesheet loaded) but
    // the font file fetch then failed - if the stylesheet request itself fails, no FontFace is ever
    // registered to report "error" on, so that case relies on the response/requestfailed listeners
    // in attachDiagnostics instead.
    const errored = await page.evaluate(() => [...new Set(Array.from(document.fonts).filter((f) => f.status === "error").map((f) => f.family))]);
    if (errored.length > 0) {
        logger.warn(`[render ${jobId}] fonts failed to load: ${errored.join(", ")}`);
    }

    // document.fonts.ready can resolve before a font that hasn't been "discovered" by layout yet
    // is even requested. A family declares several weight/style variants and most render a card
    // will never use, so "unloaded" on its own is normal noise - only flag a family with NO loaded
    // variant at all, since one of its variants is always the one actually applied to visible text
    const usedFamilies = await page.evaluate(() => {
        const families = new Set<string>();
        for (const cardEl of Array.from(document.querySelectorAll("[data-card-id]"))) {
            for (const el of Array.from(cardEl.querySelectorAll("*"))) {
                const family = (el as HTMLElement).style?.fontFamily;
                if (family) {
                    families.add(family.split(",")[0].replace(/['"]/g, "").trim());
                }
            }
        }
        return [...families];
    });
    const noneLoaded = (families: string[]) => families.filter((name) => {
        const variants = Array.from(document.fonts).filter((f) => f.family === name);
        return variants.length > 0 && !variants.some((f) => f.status === "loaded");
    });
    const notYetLoaded = await page.evaluate(noneLoaded, usedFamilies);
    if (notYetLoaded.length > 0) {
        logger.warn(`[render ${jobId}] card fonts with no loaded variant when document.fonts.ready resolved: ${notYetLoaded.join(", ")}`);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const stillNotLoaded = await page.evaluate(noneLoaded, usedFamilies);
        logger.warn(`[render ${jobId}] same fonts 500ms later: ${stillNotLoaded.join(", ") || "(all loaded by then)"}`);
    }
}

async function applyInternalAuthHeaders(page: Page) {
    const token = await dataService.integrations.fetchInternalToken();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
        const url = new URL(request.url());
        const isInternal = url.origin === process.env.CLIENT_HOST;

        const headers = {
            ...request.headers(),
            ...(isInternal ? { Authorization: `Bearer ${token}` } : {})
        };

        request.continue({ headers });
    });
}

async function checkRenderError(page: Page): Promise<void> {
    const errorEl = await page.$("#render-error");
    if (errorEl) {
        const errorJson = await errorEl.evaluate((el) => el.textContent);
        let cause: unknown = errorJson;
        try {
            cause = JSON.parse(errorJson);
        } catch {
            // Not JSON — fall back to the raw text as the cause
        }
        throw new Error("Render page returned an error", { cause });
    }
}

async function createJob(type: "single", cards: IRenderCard[], options?: SingleRenderJobOptions): Promise<SingleRenderJob>;
async function createJob(type: "batch", cards: IRenderCard[], options?: BatchRenderJobOptions): Promise<BatchRenderJob>;
async function createJob(type: RenderType, cards: IRenderCard[], options?: SingleRenderJobOptions|BatchRenderJobOptions) {
    const id = randomUUID();
    const data = cards.map((card) => ({ id: randomUUID(), card }));
    const job = {
        id,
        type,
        data,
        options
    };
    await dataService.redis.set(id, JSON.stringify(job));
    switch (type) {
        case "single":
            return job as SingleRenderJob;
        case "batch":
            return job as BatchRenderJob;
    }
}

async function launchPuppeteer(defaultViewport?: Viewport) {
    return await puppeteer.launch({
        ...(defaultViewport ? { defaultViewport } : {}),
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            "--no-zygote",
            "--mute-audio",
            "--use-gl=swiftshader",
            "--disable-background-networking",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows"
        ]
    });
}