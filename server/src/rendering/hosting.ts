import { DeleteObjectsCommand, HeadObjectCommand, NotFound, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { IPlaytestCard } from "common/models/cards";
import { SingleOrArray } from "common/types";
import { asPDF, asPNG } from ".";
import { asArray, generateReleaseImageUrl, parseCardCode, renderPlaytestingCard, SemanticVersion } from "common/utils";
import { dataService, logger } from "@/services";
import { BatchRenderJobOptions } from "@/types";
import { createSyncEmitter } from "@/services/sseService";

const baseUrl = process.env.S3_BASE_URL;
const bucket = process.env.S3_BUCKET;
const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: false,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    }
});

export async function syncImage(card: IPlaytestCard): Promise<IPlaytestCard>
export async function syncImage(cards: IPlaytestCard[]): Promise<IPlaytestCard[]>
export async function syncImage(data: SingleOrArray<IPlaytestCard>) {
    let cards = asArray(data);
    const uploaded: string[] = [];

    const packages = await Promise.all(
        cards.map(async (card) => {
            const emitter = createSyncEmitter("card", "image", `${card.project}|${card.number}|${card.version}`);
            try {
                emitter.start();
                emitter.progress("Checking");
                const isOutdated = await isImageOutdated(card);
                emitter.progress("Processing");
                const render = isOutdated ? renderPlaytestingCard(card) : null;
                const key = render?.key ?? `${card.code}@${card.version}`;
                return {
                    key,
                    card,
                    render,
                    emitter
                };
            } catch (err) {
                emitter.error("Unexpected Error");
                throw err;
            }
        })
    );
    const renders = packages
        .filter(({ card, render }) => render && !card.release)
        .map(({ render }) => render);

    const buffers = (await asPNG(renders)).reduce<Record<string, Buffer<ArrayBufferLike>>>((all, response) => {
        all[response.card.key] = all[response.card.key] ?? response.buffer;
        return all;
    }, {});

    const promises = packages.map(async (pkg) => {
        try {
            if (pkg.card.release) {
                pkg.card.imageUrl = generateReleaseImageUrl(pkg.card.release.short, pkg.card.release.number, pkg.card.name);
                const response = await fetch(pkg.card.imageUrl, { method: "HEAD" });
                if (!response.ok) {
                    pkg.emitter.error("Release Image Missing");
                    return;
                }
            } else {
                const fileKey = `${pkg.card.project}/${createImgFilenameFor(pkg.card)}`;
                const buffer = buffers[pkg.key];
                if (buffer) {
                    pkg.emitter.progress("Uploading");
                    const imageUrl = await uploadS3File(buffer, fileKey, "PNG");
                    uploaded.push(fileKey);
                    pkg.card.imageUrl = imageUrl;
                }
            }
            pkg.emitter.complete(pkg.card);
        } catch (err) {
            pkg.emitter.error("Unexpected Error");
            throw err;
        }
    });

    const results = await Promise.allSettled(promises);

    const successful = results.filter((result) => result.status === "fulfilled").length;
    const errored = packages.length - successful;
    if (uploaded.length > 0) {
        logger.info(`[Hosting] Successfully uploaded ${uploaded.length} files to S3 bucket${errored > 0 ? `, ${errored} errored` : ""}`);
    }

    cards = await dataService.cards.update(packages.map(({ card }) => card), false, false);
    return Array.isArray(data) ? cards : cards[0];
}

async function isImageOutdated(card: IPlaytestCard) {
    // Cheapest check is if there is no imageUrl
    if (!card.imageUrl) {
        return true;
    }
    // Then we check modified date of uploaded image
    const key = `${card.project}/${createImgFilenameFor(card)}`;
    const lastModified = await getS3FileLastModified(key);
    if (!lastModified) {
        return true;
    }
    // And compare it to the cards updated date
    return card.cardUpdated > lastModified;
}

export async function deleteImage(card: { project: number, number: number, version: SemanticVersion }): Promise<string>
export async function deleteImage(cards: { project: number, number: number, version: SemanticVersion }[]): Promise<string[]>
export async function deleteImage(data: SingleOrArray<{ project: number, number: number, version: SemanticVersion }>) {
    const cards = asArray(data);
    const keys: string[] = [];

    for (const card of cards) {
        const key = `${card.project}/${createImgFilenameFor(card)}`;
        keys.push(key);
    }

    const deletedUrls = await deleteS3Files(keys);

    return Array.isArray(data) ? deletedUrls : deletedUrls[0];
}

export async function printSheetUpload(data: IPlaytestCard[], filename: string, options?: BatchRenderJobOptions) {
    const renders = data.map((card) => renderPlaytestingCard(card));
    const sheet = await asPDF(renders, options);
    const key = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
    const url = await uploadS3File(sheet, key, "PDF");

    return url;
}

export async function printSheetDelete(filename: string) {
    const key = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
    return await deleteS3Files([key]);
}
async function getS3FileLastModified(key: string) {
    const fullKey = `playtesting/${key}`;
    const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: fullKey
    });
    try {
        const response = await client.send(command);
        return response.LastModified;
    } catch (err) {
        if (err instanceof NotFound) {
            return undefined;
        }
        throw new Error(`[Hosting] Failed to check last modified of "${fullKey}"`, { cause: err });
    }
}

async function uploadS3File(buffer: Buffer<ArrayBufferLike>, key: string, type: "PNG" | "PDF") {
    const fullKey = `playtesting/${key}`;
    const contentType = type === "PNG" ? "image/png" : "application/pdf";
    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: fullKey,
        Body: buffer,
        ACL: "public-read",
        ContentType: contentType
    });
    try {
        await client.send(command);
        const url = `${baseUrl}/${fullKey}`;
        logger.verbose(`[Hosting] Successfully uploaded file to S3 bucket: ${url}`);
        return url;
    } catch (err) {
        throw new Error(`[Hosting] Failed to upload "${fullKey}" to S3 bucket`, { cause: err });
    }
}

async function deleteS3Files(keys: string[]) {
    if (keys.length === 0) {
        return [];
    }
    const command = new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
            Objects: keys.map((key) => ({ Key: `playtesting/${key}` })),
            Quiet: true
        }
    });

    try {
        await client.send(command);
        logger.verbose(`[Hosting] Successfully deleted ${keys.length} files:\n- ${keys.join(("\n- "))}`);
    } catch (err) {
        logger.error(new Error (`[Hosting] Failed to delete keys "${keys.join(", ")}"`, { cause: err }));
        return [];
    }

    const urls = keys.map((key) => `${baseUrl}/${key}`);
    return urls;
}
function createImgFilenameFor(card: { project: number, number: number, version: SemanticVersion }) {
    return `${parseCardCode(false, card.project, card.number)}@${card.version.replaceAll(".", "_")}.png`;
}