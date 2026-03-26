import puppeteer, { Viewport } from "puppeteer";
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
    const browser = await launchPuppeteer();
    const page = (await browser.pages())[0] ?? await browser.newPage();
    const job = await createJob("single", cards, options);
    try {
        const token = await dataService.integrations.fetchInternalToken();
        await page.setExtraHTTPHeaders({ "Authorization": `Bearer ${token}` });
        await page.goto(`${process.env.CLIENT_HOST}/render?id=${job.id}`, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => document.fonts.ready);
        // TODO: Handle error handling, but checking a "status" div on rendered page.
        //       That div should contain either "OK" or a stringified object of the error
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
        // TODO: Create integration authorization
        await page.setExtraHTTPHeaders({ "Authorization": `Basic ${Buffer.from(`${process.env.BASIC_USERNAME}:${process.env.BASIC_PASSWORD}`).toString("base64")}` });
        await page.goto(`${process.env.CLIENT_HOST}/render?id=${job.id}`, { waitUntil: "networkidle0" });

        // TODO: Handle error handling, but checking a "status" div on rendered page.
        //       That div should contain either "OK" or a stringified object of the error
        const buffer = await page.pdf({ printBackground: true, format: "A4" });

        return buffer;
    } finally {
        await page.close();
        await browser.close();
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
        headless: false,
        args: [
            "--disable-features=IsolateOrigins",
            "--disable-site-isolation-trials",
            "--autoplay-policy=user-gesture-required",
            "--disable-background-networking",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-breakpad",
            "--disable-client-side-phishing-detection",
            "--disable-component-update",
            "--disable-default-apps",
            "--disable-dev-shm-usage",
            "--disable-domain-reliability",
            "--disable-extensions",
            "--disable-features=AudioServiceOutOfProcess",
            "--disable-hang-monitor",
            "--disable-ipc-flooding-protection",
            "--disable-notifications",
            "--disable-offer-store-unmasked-wallet-cards",
            "--disable-popup-blocking",
            "--disable-print-preview",
            "--disable-prompt-on-repost",
            "--disable-renderer-backgrounding",
            "--disable-setuid-sandbox",
            "--disable-speech-api",
            "--disable-sync",
            "--hide-scrollbars",
            "--ignore-gpu-blacklist",
            "--metrics-recording-only",
            "--mute-audio",
            "--no-default-browser-check",
            "--no-first-run",
            "--no-pings",
            "--no-sandbox",
            "--no-zygote",
            "--password-store=basic",
            "--use-gl=swiftshader",
            "--use-mock-keychain"
        ]
    });
}