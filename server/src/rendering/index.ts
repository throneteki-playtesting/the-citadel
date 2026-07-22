import puppeteer, { Page, Viewport } from "puppeteer";
import { dataService } from "@/services";
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
        await applyInternalAuthHeaders(page);
        await page.goto(`${process.env.CLIENT_HOST}/render?id=${job.id}`, { waitUntil: "networkidle0" });
        await page.evaluate(() => document.fonts.ready);
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
        await applyInternalAuthHeaders(page);
        await page.goto(`${process.env.CLIENT_HOST}/render?id=${job.id}`, { waitUntil: "networkidle0" });
        await page.evaluate(() => document.fonts.ready);
        await checkRenderError(page);

        const buffer = await page.pdf({ printBackground: true, format: "A4" });

        return buffer;
    } finally {
        await page.close();
        await browser.close();
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