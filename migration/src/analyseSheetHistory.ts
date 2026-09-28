import "dotenv/config";
import fs from "fs";
import path from "path";
import { log, createProgress } from "./lib/logger";
import { getArgValue } from "./lib/args";
import { authoriseDrive } from "./lib/googleDrive";
import { DAY_MS, firstAppearances, SHEET_DATES_PATH, SheetDates, SheetRowDate } from "./lib/sheetDates";
import {
    Column,
    COLUMN_KEYS,
    COLUMNS,
    findSheet,
    loadWorkbook,
    readSheet,
    rowValues,
    RowValues
} from "./lib/futureCardsSheet";

// Dates each "Future Cards" row to when its idea first reached the sheet, from the undocumented `revisions/tiles`
// timeline (the Drive API only lists a pruned handful) - the last save of each --every period is cached as a snapshot.

const DEFAULT_FILE_ID = "1YeE69K93rGYgrISe4jGeG5LjlL0pjJulVFm0o0DIRFA";
const CACHE_DIR = path.resolve(process.cwd(), "sheet-history");
const REPORT_PATH = path.resolve(process.cwd(), "sheet-history-report.txt");
// Part of each parsed revision's cache name - bump it whenever futureCardsSheet reads a row differently, or re-runs
// keep comparing what the old reading made of it
const PARSE_VERSION = 1;
// Google rate-limits exports - a steady pace fetches more than bursts which then wait out a 429
const EXPORT_PACE_MS = 1500;
const TIMELINE_PAGE = 1000;
// A revision changing more of the sheet than this at once is more likely a bulk edit (find/replace, a column
// rename) than cards being written - every row it touches is dated to it, so it is called out
const MASS_CHANGE_SHARE = 0.25;
const MAX_TRIES = 8;
const BACKOFF_STEP_MS = 15_000;
const PRECISION_BUCKETS: [string, number][] = [
    ["within an hour", DAY_MS / 24],
    ["within a day", DAY_MS],
    ["within a week", 7 * DAY_MS],
    ["within 30 days", 30 * DAY_MS],
    ["within 90 days", 90 * DAY_MS],
    ["over 90 days", Infinity]
];

interface Revision {
    id: string;
    time: string;
    editor?: string;
}

// One stretch of the version history page's timeline - revisions `start` to `end`, the last saved at `endMillis`
interface Tile {
    start: number;
    end: number;
    endMillis: number;
    users: string[];
}

interface TilesResponse {
    tileInfo: Tile[];
    userMap: Record<string, { name?: string }>;
}

type AuthClient = Awaited<ReturnType<typeof authoriseDrive>>["auth"];
type Period = "week" | "day";

// What a revision held, cached beside its xlsx so re-runs needn't parse it again
interface ParsedRevision {
    sheet?: string;
    missing: Column[];
    rows: RowValues[];
}

type Outcome = { revision: Revision; parsed?: ParsedRevision; problem?: string };
type Usable = { revision: Revision; parsed: ParsedRevision };

const args = process.argv.slice(2);

function formatDate(value: string | number | Date) {
    return new Date(value).toISOString().replace("T", " ").slice(0, 16);
}

function formatSpan(ms: number) {
    if (ms < DAY_MS) {
        return `${Math.round(ms / (DAY_MS / 24))}h`;
    }
    return `${Math.round(ms / DAY_MS)}d`;
}

function percent(part: number, whole: number) {
    return whole === 0 ? "-" : `${((part / whole) * 100).toFixed(1)}%`;
}

function request<T>(auth: AuthClient, url: string, responseType: "arraybuffer" | "text") {
    const client = auth as unknown as {
        request: (options: { url: string; responseType: string }) => Promise<{ data: T }>;
    };
    return client.request({ url, responseType });
}

// Every retryable failure waits longer than the last - Google's export limit takes most of a minute to lift
async function withBackoff<T>(attempt: () => Promise<T>) {
    for (let tries = 1; ; tries++) {
        try {
            return await attempt();
        } catch (err) {
            const status = (err as { response?: { status?: number } }).response?.status;
            const retryable = status === 429 || (status !== undefined && status >= 500);
            if (!retryable || tries === MAX_TRIES) {
                throw err;
            }
            await new Promise((resolve) => setTimeout(resolve, tries * BACKOFF_STEP_MS));
        }
    }
}

async function fetchTiles(auth: AuthClient, fileId: string, range: string) {
    const url = `https://docs.google.com/spreadsheets/d/${fileId}/revisions/tiles?id=${fileId}&${range}&showDetailedRevisions=true`;
    const { data } = await withBackoff(() => request<string>(auth, url, "text"));
    // Prefixed with )]}' against JSON hijacking
    return JSON.parse(data.replace(/^\)\]\}'\n?/, "")) as TilesResponse;
}

/** The whole version history, oldest first - paged backwards from the latest revision to the first */
async function fetchTimeline(auth: AuthClient, fileId: string) {
    const latest = await fetchTiles(auth, fileId, "start=1");
    const tiles = new Map<number, Tile>();
    const users = new Map<string, string>();
    const progress = createProgress("Timeline");
    let end = Math.max(...latest.tileInfo.map((tile) => tile.end));
    const total = end;
    while (end >= 1) {
        progress.write(`revisions ${end} → 1 of ${total}`);
        const page = await fetchTiles(auth, fileId, `start=${Math.max(1, end - TIMELINE_PAGE + 1)}&end=${end}`);
        for (const tile of page.tileInfo) {
            tiles.set(tile.end, tile);
        }
        for (const [id, user] of Object.entries(page.userMap ?? {})) {
            users.set(id, user.name ?? "?");
        }
        const earliest = Math.min(...page.tileInfo.map((tile) => tile.start));
        end = Number.isFinite(earliest) && earliest <= end ? earliest - 1 : end - TIMELINE_PAGE;
    }
    const timeline = [...tiles.values()].sort((a, b) => a.end - b.end);
    progress.done(`${total} revisions, ${timeline.length} saves`);
    return { timeline, users, total };
}

function periodOf(millis: number, every: Period) {
    const date = new Date(millis);
    if (every === "week") {
        // Weeks start on Monday
        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    }
    return date.toISOString().slice(0, 10);
}

/** The last save of each period that had any, and always the very latest */
function pickSnapshots(timeline: Tile[], users: Map<string, string>, every: Period): Revision[] {
    const lastOfPeriod = new Map<string, { tile: Tile; editors: Set<string> }>();
    for (const tile of timeline) {
        const period = periodOf(tile.endMillis, every);
        const entry = lastOfPeriod.get(period) ?? { tile, editors: new Set<string>() };
        entry.tile = tile;
        tile.users.forEach((user) => entry.editors.add(users.get(user) ?? "?"));
        lastOfPeriod.set(period, entry);
    }
    return [...lastOfPeriod.values()].map(({ tile, editors }) => ({
        id: String(tile.end),
        time: new Date(tile.endMillis).toISOString(),
        editor: [...editors].join(", ")
    }));
}

async function download(auth: AuthClient, fileId: string, revision: string) {
    const url = `https://docs.google.com/spreadsheets/export?id=${fileId}&revision=${revision}&exportFormat=xlsx`;
    const { data } = await withBackoff(() => request<ArrayBuffer>(auth, url, "arraybuffer"));
    return Buffer.from(data);
}

async function parseRevision(file: string): Promise<ParsedRevision> {
    const workbook = await loadWorkbook(file);
    const sheet = findSheet(workbook);
    const read = sheet && readSheet(sheet);
    if (!sheet || !read) {
        return { missing: [...COLUMN_KEYS], rows: [] };
    }
    return { sheet: sheet.name, missing: read.missing, rows: read.rows.map(({ cells }) => rowValues(cells)) };
}

async function collect(fileId: string, every: Period) {
    const { drive, auth } = await authoriseDrive();
    const { data: file } = await drive.files.get({ fileId, fields: "name, createdTime, modifiedTime" });
    const { timeline, users, total } = await fetchTimeline(auth, fileId);
    const revisions = pickSnapshots(timeline, users, every);
    fs.mkdirSync(CACHE_DIR, { recursive: true });

    const outcomes: Outcome[] = [];
    const progress = createProgress("Snapshots");
    for (const [index, revision] of revisions.entries()) {
        progress.counter(index + 1, revisions.length, formatDate(revision.time));
        const xlsxPath = path.join(CACHE_DIR, `${revision.id}.xlsx`);
        const parsedPath = path.join(CACHE_DIR, `${revision.id}.v${PARSE_VERSION}.json`);
        try {
            if (!fs.existsSync(parsedPath)) {
                if (!fs.existsSync(xlsxPath)) {
                    fs.writeFileSync(xlsxPath, await download(auth, fileId, revision.id));
                    await new Promise((resolve) => setTimeout(resolve, EXPORT_PACE_MS));
                }
                fs.writeFileSync(parsedPath, JSON.stringify(await parseRevision(xlsxPath)), "utf-8");
            }
            const parsed = JSON.parse(fs.readFileSync(parsedPath, "utf-8")) as ParsedRevision;
            outcomes.push(
                parsed.sheet ? { revision, parsed } : { revision, problem: "No sheet with a card header row in it" }
            );
        } catch (err) {
            outcomes.push({ revision, problem: `Couldn't be read: ${(err as Error).message}` });
        }
    }
    progress.done(`${revisions.length} taken`);
    return { file, revisions, outcomes, total, saves: timeline.length };
}

type ReportInput = {
    fileId: string;
    file: Awaited<ReturnType<typeof collect>>["file"];
    every: Period;
    revisions: Revision[];
    usable: Usable[];
    problems: Outcome[];
    total: number;
    saves: number;
    present: (outcome: Usable) => Column[];
    rows: SheetRowDate[];
    timeline: ReturnType<typeof firstAppearances>["timeline"];
};

function buildReport({
    fileId,
    file,
    every,
    revisions,
    usable,
    problems,
    total,
    saves,
    present,
    rows,
    timeline
}: ReportInput) {
    const latest = usable[usable.length - 1];
    const lines: string[] = [];
    const section = (title: string) => lines.push("", `── ${title} ──`);
    const line = (text = "") => lines.push(`  ${text}`);

    line("All times UTC.");
    section("Sheet");
    line(`${file.name} (${fileId})`);
    line(
        `Created ${file.createdTime ? formatDate(file.createdTime) : "unknown"}, last modified ${file.modifiedTime ? formatDate(file.modifiedTime) : "unknown"}`
    );

    section("Revisions");
    line(`In the history:     ${total} revisions, over ${saves} saves`);
    line(`Snapshots taken:    ${revisions.length} (the last save of each ${every} with any)`);
    line(`Read:               ${usable.length}`);
    line(`Unreadable:         ${problems.length}`);
    line(`Span:               ${formatDate(usable[0].revision.time)} → ${formatDate(latest.revision.time)}`);
    const gaps = usable
        .slice(1)
        .map((outcome, index) => ({
            from: usable[index].revision.time,
            to: outcome.revision.time,
            ms: Date.parse(outcome.revision.time) - Date.parse(usable[index].revision.time)
        }))
        .sort((a, b) => a.ms - b.ms);
    if (gaps.length > 0) {
        line(`Median gap:         ${formatSpan(gaps[Math.floor(gaps.length / 2)].ms)}`);
        line("Longest gaps (anything changed in one is dated to its end):");
        for (const gap of gaps.slice(-5).reverse()) {
            line(`    ${formatSpan(gap.ms).padStart(5)}  ${formatDate(gap.from)} → ${formatDate(gap.to)}`);
        }
    }
    for (const { revision, problem } of problems) {
        line(`    ${formatDate(revision.time)} (${revision.id}): ${problem}`);
    }

    section("Columns compared");
    line("Each snapshot is compared only on the columns it has - from when each first appears:");
    for (const key of COLUMN_KEYS) {
        const first = usable.find((outcome) => present(outcome).includes(key));
        line(`    ${COLUMNS[key].padEnd(18)} ${first ? formatDate(first.revision.time) : "never"}`);
    }
    const sheetNames = [...new Set(usable.map((outcome) => outcome.parsed.sheet))];
    line(`Sheet read: ${sheetNames.join(", ")}`);

    section("Coverage of the latest version");
    const dated = rows.filter((entry) => entry.after);
    const predating = rows.length - dated.length;
    line(`Rows:                                ${rows.length}`);
    line(`Dated from history:                  ${dated.length} (${percent(dated.length, rows.length)})`);
    line(`Predate the history (need estimate): ${predating} (${percent(predating, rows.length)})`);
    line("Precision of the dated rows (time between the snapshot before and the one it first appears in):");
    for (const [index, [label, limit]] of PRECISION_BUCKETS.entries()) {
        const lower = index === 0 ? 0 : PRECISION_BUCKETS[index - 1][1];
        const inBucket = dated.filter((entry) => {
            const span = Date.parse(entry.date) - Date.parse(entry.after!);
            return span > lower && span <= limit;
        }).length;
        line(`    ${label.padEnd(16)} ${String(inBucket).padStart(5)}  ${percent(inBucket, dated.length)}`);
    }

    // The first revision is every row arriving at once by definition, so it's never counted as one
    const isBulk = ({ index, rows: total, added }: (typeof timeline)[number]) =>
        index > 0 && total > 0 && added / total > MASS_CHANGE_SHARE;
    const massChanges = timeline.filter(isBulk);
    const massTimes = new Set(massChanges.map(({ index }) => usable[index].revision.time));
    const onMass = dated.filter((entry) => massTimes.has(entry.date)).length;
    if (massChanges.length > 0) {
        line(`Arrived in a bulk-change snapshot (see below) - pasted in rather than written there: ${onMass}`);
    }

    section("Rows by month first appearing");
    const byMonth = new Map<string, number>();
    for (const entry of rows) {
        const month = entry.after ? entry.date.slice(0, 7) : "(predates history)";
        byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
    }
    const widest = Math.max(...byMonth.values());
    for (const [month, total] of [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        line(`    ${month.padEnd(18)} ${String(total).padStart(5)}  ${"█".repeat(Math.ceil((total / widest) * 40))}`);
    }

    section("By designer");
    const designers = new Map<string, { rows: number; dated: number }>();
    for (const entry of rows) {
        const designer = entry.values.designer || "(none)";
        const tally = designers.get(designer) ?? { rows: 0, dated: 0 };
        tally.rows++;
        tally.dated += entry.after ? 1 : 0;
        designers.set(designer, tally);
    }
    const designerWidth = Math.max(...[...designers.keys()].map((name) => name.length));
    for (const [designer, tally] of [...designers.entries()].sort((a, b) => b[1].rows - a[1].rows)) {
        line(
            `    ${designer.padEnd(designerWidth)}  ${String(tally.rows).padStart(5)} rows  ${percent(tally.dated, tally.rows).padStart(6)} dated`
        );
    }

    section(`Revision timeline (${timeline.length})`);
    line("date              rows   +new  ~edit  -gone  editor");
    for (const entry of timeline) {
        const { index, rows: total, added, edited, removed } = entry;
        const outcome = usable[index];
        const flag = isBulk(entry) ? "  ← bulk change" : "";
        line(
            `${formatDate(outcome.revision.time)}  ${String(total).padStart(5)}  ${String(added).padStart(5)}  ${String(edited).padStart(5)}  ${String(removed).padStart(5)}  ${outcome.revision.editor ?? "?"}${flag}`
        );
    }

    return lines;
}

async function main() {
    const fileId = getArgValue(args, "file-id") ?? DEFAULT_FILE_ID;
    const every = getArgValue(args, "every") ?? "week";
    if (every !== "week" && every !== "day") {
        log.error("--every must be week or day");
        process.exitCode = 1;
        return;
    }

    log.section("The Citadel - Analyse Sheet History");
    log.info(`Sheet: ${fileId}`);
    log.info(`Snapshots: the last save of each ${every}`);

    const { file, revisions, outcomes, total, saves } = await collect(fileId, every);
    const usable = outcomes.filter((outcome): outcome is Usable => !!outcome.parsed);
    const problems = outcomes.filter((outcome) => outcome.problem);
    if (usable.length === 0) {
        log.error("No revision of the sheet could be read - nothing to date rows from");
        process.exitCode = 1;
        return;
    }

    // Who a card is credited to isn't the card changing - the sheet has reassigned designers in bulk
    const present = (outcome: Usable) =>
        COLUMN_KEYS.filter((key) => key !== "designer" && !outcome.parsed.missing.includes(key));
    const latest = usable[usable.length - 1];
    const columns = present(latest);
    const { rows, timeline } = firstAppearances(
        usable.map((outcome) => ({ time: outcome.revision.time, rows: outcome.parsed.rows, columns: present(outcome) }))
    );
    const dates: SheetDates = {
        fileId,
        generatedAt: new Date().toISOString(),
        fileCreated: file.createdTime ?? undefined,
        firstRevision: usable[0].revision.time,
        lastRevision: latest.revision.time,
        columns,
        rows
    };
    fs.writeFileSync(SHEET_DATES_PATH, JSON.stringify(dates), "utf-8");

    const lines = buildReport({
        fileId,
        file,
        every,
        revisions,
        usable,
        problems,
        total,
        saves,
        present,
        rows,
        timeline
    });
    lines.forEach((text) => console.log(text));
    fs.writeFileSync(REPORT_PATH, lines.join("\n") + "\n", "utf-8");
    log.section("Written");
    log.success(`Row dates: ${SHEET_DATES_PATH}`);
    log.success(`Report:    ${REPORT_PATH}`);
}

main().catch((err) => {
    log.error("Analysis failed", err);
    process.exit(1);
});
