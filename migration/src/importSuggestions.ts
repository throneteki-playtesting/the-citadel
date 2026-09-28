import "dotenv/config";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import readline from "readline/promises";
import { Db, MongoClient } from "mongodb";
import { log } from "./lib/logger";
import {
    Column,
    COLUMNS,
    findSheet,
    isBlank,
    loadWorkbook,
    normalise,
    plain,
    readSheet,
    rowValues,
    RowValues,
    Run,
    SheetCells,
    SHEET_NAME
} from "./lib/futureCardsSheet";
import { DAY_MS, linkRows, readSheetDates, SHEET_DATES_PATH, SheetDates } from "./lib/sheetDates";
import { getArgValue } from "./lib/args";
import { ENVIRONMENTS, isEnvironment, resolveDatabase } from "./lib/environments";
import { destroyDiscordClient, fetchAllGuildMembers } from "./lib/discord";
import { CardSuggestion } from "../../common/models/schemas";
import { ABILITY_TEXT_SOURCE, deriveFields } from "../../common/designGuidelines/deriveFields";
import { encodeEntities } from "../../common/richText/format";
import { toPlain } from "../../common/richText/toPlain";
import { abilityIcons } from "../../common/utils";
import {
    ChallengeIcon,
    DefaultDeckLimit,
    Faction,
    factions,
    ICard,
    ICardSuggestion,
    PlotValue,
    Type,
    types
} from "../../common/models/cards";

// One-off import of the design team's "Future Cards" sheet into legacy suggestions. Nothing is written unless
// every row converts cleanly and the summary is confirmed at the prompt.

const DESIGNERS_PATH = path.resolve(process.cwd(), "designers.json");
const ERRORS_PATH = path.resolve(process.cwd(), "import-suggestions-errors.txt");

const ABILITY_LINE_REGEX = new RegExp(`^(\\s*)(${ABILITY_TEXT_SOURCE})`);
const ABILITY_KEYWORD_REGEX = new RegExp(`^(${ABILITY_TEXT_SOURCE})$`);
const ICON_TOKEN_REGEX = /:([a-zA-Z]+):|\[([a-zA-Z]+)\]/g;
const TRAIT_MAX_WORDS = 4;
// The sheet's spelling, with non-letters already stripped
const FACTION_ALIASES: Record<string, Faction> = { nightswatch: "thenightswatch" };
// Not a card type the Citadel supports - skipped, and listed in the summary
const IGNORED_TYPE = "title";
const ICON_ALIASES: Record<string, ChallengeIcon> = {
    m: "military",
    military: "military",
    i: "intrigue",
    intrigue: "intrigue",
    p: "power",
    power: "power"
};

type RowError = { column: string; message: string };

interface RowResult {
    row: number;
    name: string;
    designer: string;
    errors: RowError[];
    card?: ICard;
    values: RowValues;
}

type DateSource = "history" | "predatesHistory" | "notInHistory";

interface CreatedDate {
    date: Date;
    source: DateSource;
    /** For a date from the history, how long the window it was changed in is */
    spanMs?: number;
}

interface ProjectCard {
    project: { number: number; code: string; isDraft: boolean };
    number: number;
    /** A draft project's slot holds each version as a separate card, so one there is matched by its version */
    version?: string;
}

const args = process.argv.slice(2);

function parseNumber(value: string, allowX: boolean): number | "X" | undefined {
    if (/^\d+$/.test(value)) {
        return parseInt(value, 10);
    }
    if (allowX && value.toUpperCase() === "X") {
        return "X";
    }
    return undefined;
}

// Bold-italic is a trait; everything else in the sheet's formatting is either decoration or applied by
// ABILITY_TEXT_SOURCE below, so it is deliberately not read
function convertText(runs: Run[], errors: RowError[]) {
    const segments: { text: string; trait: boolean }[] = [];
    for (const run of runs) {
        const trait = run.bold && run.italic;
        const last = segments[segments.length - 1];
        if (last && last.trait === trait) {
            last.text += run.text;
        } else {
            segments.push({ text: run.text, trait });
        }
    }

    let html = "";
    for (const segment of segments) {
        if (!segment.trait) {
            html += encodeEntities(segment.text);
            continue;
        }
        const [, leading, inner, trailing] = segment.text.match(/^([\s.,;]*)([\s\S]*?)([\s.,;]*)$/)!;
        if (inner === "" || ABILITY_KEYWORD_REGEX.test(inner)) {
            html += encodeEntities(segment.text);
            continue;
        }
        // A list of traits is often bold-italic as one run, commas included - each is marked on its own
        const traits = inner.split(/(,\s*)/);
        const isTraitList = traits.every(
            (part, index) =>
                index % 2 === 1 ||
                (part !== "" &&
                    !part.includes("\n") &&
                    !part.includes(":") &&
                    part.split(/\s+/).length <= TRAIT_MAX_WORDS)
        );
        if (!isTraitList) {
            errors.push({
                column: COLUMNS.text,
                message: `Bold-italic text doesn't look like a trait: "${truncate(inner)}"`
            });
            continue;
        }
        const marked = traits.map((part, index) =>
            index % 2 === 1 ? encodeEntities(part) : `<b><em>${encodeEntities(part)}</em></b>`
        );
        html += `${encodeEntities(leading)}${marked.join("")}${encodeEntities(trailing)}`;
    }

    html = html.replace(ICON_TOKEN_REGEX, (token, colonName?: string, bracketName?: string) => {
        const name = (colonName ?? bracketName ?? "").toLowerCase();
        if (!(name in abilityIcons)) {
            errors.push({ column: COLUMNS.text, message: `Unknown icon "${token}"` });
            return token;
        }
        return `[${name}]`;
    });

    return html
        .split("\n")
        .map((line) => line.trimEnd().replace(ABILITY_LINE_REGEX, "$1<b>$2</b>"))
        .join("\n")
        .trim();
}

function truncate(value: string, length = 60) {
    const flat = value.replace(/\n/g, " ⏎ ");
    return flat.length > length ? `${flat.slice(0, length)}…` : flat;
}

function convertRow(cells: SheetCells, errors: RowError[]): ICard | undefined {
    const value = (column: Column) => plain(cells[column]);
    const fail = (column: Column, message: string) => {
        errors.push({ column: COLUMNS[column], message });
    };

    const factionKey = value("faction")
        .toLowerCase()
        .replace(/[^a-z]/g, "");
    const faction = factions.find((f) => f === (FACTION_ALIASES[factionKey] ?? factionKey)) as Faction | undefined;
    if (!faction) {
        fail("faction", `Unknown faction "${value("faction")}"`);
    }

    const type = types.find((t) => t === value("type").toLowerCase()) as Type | undefined;
    if (!type) {
        fail("type", `Unknown type "${value("type")}"`);
        return undefined;
    }

    const card: Partial<ICard> = {
        faction,
        name: value("name"),
        type,
        traits: isBlank(value("traits"))
            ? []
            : value("traits")
                  .split(".")
                  .map((trait) => trait.trim())
                  .filter((trait) => trait !== "")
    };

    if (type === "agenda") {
        if (!isBlank(value("loyal"))) {
            fail("loyal", `Expected "-" for an agenda, got "${value("loyal")}"`);
        }
    } else if (faction && faction !== "neutral") {
        const loyal = value("loyal").toLowerCase();
        if (loyal === "loyal") {
            card.loyal = true;
        } else if (loyal === "non-loyal") {
            card.loyal = false;
        } else {
            fail("loyal", `Expected "Loyal" or "Non-Loyal", got "${value("loyal")}"`);
        }
    }

    const expectBlank = (column: Column, reason: string) => {
        if (!isBlank(value(column))) {
            fail(column, `Expected "-" or empty ${reason}, got "${value(column)}"`);
        }
    };
    const plotValue = (column: Column, stat: string): PlotValue => {
        const parsed = parseNumber(value(column), true);
        if (parsed === undefined) {
            fail(column, `Expected a number or "X" for ${stat}, got "${value(column)}"`);
            return 0;
        }
        return parsed;
    };

    if (type === "plot") {
        card.plotStats = {
            income: plotValue("uniqueIncome", "income"),
            initiative: plotValue("costInitiative", "initiative"),
            claim: plotValue("strengthClaim", "claim"),
            reserve: plotValue("iconsReserve", "reserve")
        };
    } else {
        if (type === "character" || type === "location" || type === "attachment") {
            const unique = value("uniqueIncome").toLowerCase();
            if (unique === "unique") {
                card.unique = true;
            } else if (unique === "non-unique") {
                card.unique = false;
            } else {
                fail("uniqueIncome", `Expected "Unique" or "Non-Unique", got "${value("uniqueIncome")}"`);
            }
        } else {
            expectBlank("uniqueIncome", `for a ${type}`);
        }

        if (type === "agenda") {
            expectBlank("costInitiative", "for an agenda");
        } else if (value("costInitiative") === "-") {
            card.cost = "-";
        } else {
            const cost = parseNumber(value("costInitiative"), true);
            if (cost === undefined) {
                fail("costInitiative", `Expected a number, "X" or "-" for cost, got "${value("costInitiative")}"`);
            } else {
                card.cost = cost;
            }
        }

        if (type === "character") {
            const strength = parseNumber(value("strengthClaim"), true);
            if (strength === undefined) {
                fail("strengthClaim", `Expected a number or "X" for STR, got "${value("strengthClaim")}"`);
            } else {
                card.strength = strength;
            }

            card.icons = { military: false, intrigue: false, power: false };
            if (!isBlank(value("iconsReserve"))) {
                for (const part of value("iconsReserve").split("/")) {
                    const icon = ICON_ALIASES[part.trim().toLowerCase()];
                    if (!icon) {
                        fail("iconsReserve", `Unknown icon "${part.trim()}" (expected M, I and/or P separated by "/")`);
                    } else {
                        card.icons[icon] = true;
                    }
                }
            }
        } else {
            expectBlank("strengthClaim", `for a ${type}`);
            expectBlank("iconsReserve", `for a ${type}`);
        }
    }

    const text = convertText(cells.text, errors);
    if (text !== "") {
        card.text = text;
    }

    const flavor = value("flavor");
    if (flavor !== "") {
        card.flavor = flavor;
    }

    if (value("deckLimit") === "") {
        card.deckLimit = DefaultDeckLimit[type];
    } else {
        const deckLimit = parseNumber(value("deckLimit"), false);
        if (deckLimit === undefined) {
            fail("deckLimit", `Expected a number, got "${value("deckLimit")}"`);
        } else {
            card.deckLimit = deckLimit as number;
        }
    }

    return card as ICard;
}

function readMapping(file: string): Record<string, string> {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : {};
}

// Adds each unseen key with a blank value, so the file always lists everything still to be filled in
function addMissingMappings(file: string, map: Record<string, string>, keys: string[], instruction: string) {
    const missing = [...new Set(keys)].filter((key) => !(key in map));
    if (missing.length === 0) {
        return;
    }
    for (const key of missing) {
        map[key] = "";
    }
    const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(file, JSON.stringify(sorted, null, 4), "utf-8");
    log.warn(`${missing.length} new name(s) added to ${file} - ${instruction}`);
}

// Resolves each id to a name to report it under - `unresolved` holds why an id could not be found
async function resolveDiscordIds(ids: string[], db: Db) {
    const names = new Map<string, string>();
    const users = await db
        .collection("users")
        .find({ discordId: { $in: ids } }, { projection: { _id: 0, discordId: 1, displayname: 1, username: 1 } })
        .toArray();
    for (const user of users) {
        names.set(user.discordId, `${user.displayname} (@${user.username})`);
    }

    const notInUsers = ids.filter((id) => !names.has(id));
    const unresolved = new Map<string, string>();
    if (notInUsers.length > 0) {
        log.info(`${notInUsers.length} designer(s) not in users - checking Discord`);
        try {
            const members = await fetchAllGuildMembers();
            for (const id of notInUsers) {
                const member = members.find((m) => m.user.id === id);
                if (member) {
                    names.set(id, `${member.displayName} (@${member.user.username}, not yet a Citadel user)`);
                } else {
                    unresolved.set(id, "Not found in users or the Discord guild");
                }
            }
        } catch (err) {
            for (const id of notInUsers) {
                unresolved.set(id, `Not found in users, and Discord lookup failed (${(err as Error).message})`);
            }
        }
    }

    return { names, unresolved };
}

function matchKey(name: string, text?: string) {
    const flatten = (value: string) => normalise(value).replace(/\s+/g, " ").trim().toLowerCase();
    return `${flatten(name)}\u0000${flatten(toPlain(text ?? ""))}`;
}

// A row whose name and text exactly match a project card's version is that card, but only when the match is
// one-to-one both ways - anything less certain is left to be settled on the suggestion's own page
async function findCardMatches(db: Db, results: RowResult[]) {
    const [projects, cards, archived] = await Promise.all([
        db
            .collection("projects")
            .find({}, { projection: { _id: 0, number: 1, code: 1, draft: 1 } })
            .toArray(),
        db
            .collection("cards")
            .find({}, { projection: { _id: 0, project: 1, number: 1, version: 1, name: 1, text: 1, suggestionId: 1 } })
            .toArray(),
        db
            .collection("suggestions")
            .find({ "archived.project": { $exists: true } }, { projection: { _id: 0, archived: 1 } })
            .toArray()
    ]);
    const projectsByNumber = new Map(projects.map((project) => [project.number as number, project]));
    const claimedByArchive = new Set(
        archived.map((suggestion) => `${suggestion.archived.project.code}#${suggestion.archived.project.number}`)
    );

    const cardsByKey = new Map<string, Map<string, ProjectCard>>();
    const claimed = new Set<string>();
    for (const card of cards) {
        const project = projectsByNumber.get(card.project);
        if (!project) {
            continue;
        }
        const version: string | undefined = project.draft ? card.version : undefined;
        const id = version ? `${project.number}|${card.number}|${version}` : `${project.number}|${card.number}`;
        if (card.suggestionId || claimedByArchive.has(`${project.code}#${card.number}`)) {
            claimed.add(id);
        }
        const key = matchKey(card.name, card.text);
        const matching = cardsByKey.get(key) ?? new Map<string, ProjectCard>();
        matching.set(id, {
            project: { number: project.number, code: project.code, isDraft: !!project.draft },
            number: card.number,
            version
        });
        cardsByKey.set(key, matching);
    }

    const candidates = new Map<RowResult, { id: string; card: ProjectCard }[]>();
    const rowsByCard = new Map<string, number>();
    for (const result of results) {
        if (!result.card) {
            continue;
        }
        const matching = [...(cardsByKey.get(matchKey(result.card.name, result.card.text))?.entries() ?? [])]
            .filter(([id]) => !claimed.has(id))
            .map(([id, card]) => ({ id, card }));
        if (matching.length === 0) {
            continue;
        }
        candidates.set(result, matching);
        for (const { id } of matching) {
            rowsByCard.set(id, (rowsByCard.get(id) ?? 0) + 1);
        }
    }

    const matches = new Map<RowResult, ProjectCard>();
    let ambiguous = 0;
    for (const [result, matching] of candidates) {
        if (matching.length === 1 && rowsByCard.get(matching[0].id) === 1) {
            matches.set(result, matching[0].card);
        } else {
            ambiguous++;
        }
    }
    return { matches, ambiguous };
}

// A row predating the history is spread evenly, by sheet position, across its designer's window - from the later of
// the sheet's creation and their joining the Discord, up to the first revision - so no one day takes their backlog.
// A row missing from the history arrived after it was analysed, so it is dated to now.
function assignCreatedDates(
    results: RowResult[],
    dates: SheetDates,
    joinedAt: Map<string, Date>,
    designerMap: Record<string, string>,
    now: Date
) {
    const assigned = new Map<RowResult, CreatedDate>();
    const estimated = new Map<string, { result: RowResult; source: DateSource }[]>();
    // Paired the way the history pairs one version with the next, so a row fixed only here still finds its idea there
    const links = linkRows(
        dates.rows.map((row) => row.values),
        results.map((result) => result.values),
        dates.columns
    );

    for (const [index, result] of results.entries()) {
        const link = links[index];
        if (link === undefined) {
            assigned.set(result, { date: now, source: "notInHistory" });
            continue;
        }
        const entry = dates.rows[link];
        if (entry.after) {
            assigned.set(result, {
                date: new Date(entry.date),
                source: "history",
                spanMs: Date.parse(entry.date) - Date.parse(entry.after)
            });
            continue;
        }
        const waiting = estimated.get(result.designer) ?? [];
        waiting.push({ result, source: "predatesHistory" });
        estimated.set(result.designer, waiting);
    }

    const end = Date.parse(dates.firstRevision);
    const floor = dates.fileCreated ? Math.min(Date.parse(dates.fileCreated), end) : end;
    for (const [designer, waiting] of estimated) {
        const joined = joinedAt.get(designerMap[designer])?.getTime();
        const start = joined !== undefined && joined > floor && joined < end ? joined : floor;
        waiting.sort((a, b) => a.result.row - b.result.row);
        waiting.forEach(({ result, source }, index) => {
            assigned.set(result, {
                date: new Date(start + ((end - start) * (index + 0.5)) / waiting.length),
                source
            });
        });
    }
    return assigned;
}

// When each Discord member joined - where it can't be had, estimates start from the sheet's creation instead
async function fetchJoinDates() {
    const joinedAt = new Map<string, Date>();
    try {
        for (const member of await fetchAllGuildMembers()) {
            if (member.joinedAt) {
                joinedAt.set(member.user.id, member.joinedAt);
            }
        }
    } catch (err) {
        log.warn(
            `Discord join dates unavailable - estimates start from the sheet's creation (${(err as Error).message})`
        );
    }
    return joinedAt;
}

function printCreatedDates(ready: RowResult[], createdDates: Map<RowResult, CreatedDate>, dates?: SheetDates) {
    if (!dates) {
        log.warn("Created dates: none - every suggestion is dated to now (--without-dates)");
        return;
    }
    const entries = ready.map((result) => createdDates.get(result)!);
    const of = (source: DateSource) => entries.filter((entry) => entry.source === source);
    const share = (part: number) => `${part} (${((part / Math.max(entries.length, 1)) * 100).toFixed(1)}%)`;
    const fromHistory = of("history");
    const spans = fromHistory.map((entry) => entry.spanMs!).sort((a, b) => a - b);
    log.info(`Created dates (sheet history ${dates.firstRevision.slice(0, 10)} → ${dates.lastRevision.slice(0, 10)}):`);
    log.info(`    from the sheet's history:            ${share(fromHistory.length)}`);
    if (spans.length > 0) {
        // How tightly each date is pinned down - the gap between the snapshots either side of its arrival, which
        // says nothing about how long ago that was
        const bands = [7, 30, 90].map((days, index, all) => {
            const lower = index === 0 ? 0 : all[index - 1] * DAY_MS;
            return `${spans.filter((span) => span > lower && span <= days * DAY_MS).length} to ${days} days`;
        });
        log.info(`        accuracy, per date:              ${bands.join(" · ")}`);
        log.info(
            `        median accuracy:                 ${(spans[Math.floor(spans.length / 2)] / DAY_MS).toFixed(1)} days`
        );
    }
    const byYear = new Map<string, number>();
    for (const entry of entries) {
        const year = String(entry.date.getUTCFullYear());
        byYear.set(year, (byYear.get(year) ?? 0) + 1);
    }
    log.info(
        `    created, by year:                    ${[...byYear.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([year, total]) => `${year} ${total}`)
            .join(" · ")}`
    );
    log.info(`    estimated - predates the history:    ${share(of("predatesHistory").length)}`);
    log.info(`    dated to now - not found in history: ${share(of("notInHistory").length)}`);
    if (of("notInHistory").length > 0) {
        log.warn(
            "Rows not found in the history couldn't be matched to any row of the sheet's latest analysed version, even " +
                "by name - re-run analyse-sheet-history if they were added since, or check whether they were renamed here"
        );
    }
}

function tally(results: { key: string }[]) {
    const counts = new Map<string, number>();
    for (const { key } of results) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function printTally(title: string, entries: [string, number][]) {
    if (entries.length === 0) {
        return;
    }
    log.info(`${title}:`);
    const width = Math.max(...entries.map(([key]) => key.length));
    for (const [key, count] of entries) {
        log.info(`    ${key.padEnd(width)}  ${count}`);
    }
}

async function main() {
    const environment = getArgValue(args, "environment");
    const file = getArgValue(args, "file");
    if (!environment || !isEnvironment(environment)) {
        log.error(`--environment is required and must be one of: ${ENVIRONMENTS.join(", ")}`);
        return process.exit(1);
    }
    if (!file || !fs.existsSync(file)) {
        log.error("--file must point at the exported .xlsx");
        return process.exit(1);
    }

    const withoutDates = args.includes("--without-dates");
    const sheetDates = withoutDates ? undefined : readSheetDates();
    if (!withoutDates && !sheetDates) {
        log.error(
            `No ${SHEET_DATES_PATH} - run analyse-sheet-history first, or pass --without-dates to date every suggestion to now`
        );
        return process.exit(1);
    }

    const { url, name: dbName } = resolveDatabase(environment);

    log.section("The Citadel - Import Suggestions");
    log.info(`File:        ${path.resolve(file)}`);
    log.info(`Environment: ${environment} (${dbName})`);

    const workbook = await loadWorkbook(file);
    const sheet = findSheet(workbook);
    if (!sheet) {
        log.error(`Sheet "${SHEET_NAME}" not found, and no other sheet has a "${COLUMNS.name}" header row`);
        return process.exit(1);
    }
    const read = readSheet(sheet);
    if (!read) {
        log.error(`No header row containing "${COLUMNS.name}" found`);
        return process.exit(1);
    }
    if (read.missing.length > 0) {
        log.error(`Missing column(s): ${read.missing.map((key) => COLUMNS[key]).join(", ")}`);
        return process.exit(1);
    }

    const results: RowResult[] = [];
    const titles: { row: number; name: string; designer: string }[] = [];
    const noDesigner: { row: number; name: string }[] = [];

    for (const { row: rowNumber, cells } of read.rows) {
        const name = plain(cells.name);
        const designer = plain(cells.designer);

        if (plain(cells.type).toLowerCase() === IGNORED_TYPE) {
            titles.push({ row: rowNumber, name, designer: designer || "(none)" });
            continue;
        }
        if (designer === "") {
            noDesigner.push({ row: rowNumber, name });
            continue;
        }

        const errors: RowError[] = [];
        const card = convertRow(cells, errors);
        results.push({ row: rowNumber, name, designer, errors, card, values: rowValues(cells) });
    }

    const designers = [...new Set(results.map((result) => result.designer))];
    const designerMap = readMapping(DESIGNERS_PATH);
    addMissingMappings(DESIGNERS_PATH, designerMap, designers, "fill in their Discord ids");

    const client = new MongoClient(url);
    try {
        await client.connect();
        const db = client.db(dbName);

        // Every row is inserted under a fresh id, so a second run would duplicate the whole sheet
        const alreadyImported = await db.collection("suggestions").countDocuments({ legacy: true });
        if (alreadyImported > 0) {
            log.error(
                `${environment} already holds ${alreadyImported} legacy suggestion(s) - the import has already run`
            );
            process.exitCode = 1;
            return;
        }

        const ids = [...new Set(designers.map((designer) => designerMap[designer]).filter((id) => !!id))];
        const { names: designerNames, unresolved } = await resolveDiscordIds(ids, db);

        const { matches, ambiguous } = await findCardMatches(db, results);

        const now = new Date();
        const createdDates = sheetDates
            ? assignCreatedDates(results, sheetDates, await fetchJoinDates(), designerMap, now)
            : new Map<RowResult, CreatedDate>();
        const documents: ICardSuggestion[] = [];
        // Written once the suggestions exist and have ids - a draft project's card names its suggestion instead,
        // and beginning the project archives it
        const draftLinks: { document: ICardSuggestion; card: ProjectCard }[] = [];
        for (const result of results) {
            const discordId = designerMap[result.designer];
            if (!discordId) {
                result.errors.push({
                    column: COLUMNS.designer,
                    message: `"${result.designer}" has no Discord id in designers.json`
                });
            } else if (unresolved.has(discordId)) {
                result.errors.push({
                    column: COLUMNS.designer,
                    message: `"${result.designer}" (${discordId}): ${unresolved.get(discordId)}`
                });
            }
            if (!result.card || result.errors.length > 0) {
                continue;
            }
            const match = matches.get(result);
            const created = createdDates.get(result)?.date ?? now;

            const { value, error } = CardSuggestion.DraftSave.validate(
                {
                    created,
                    createdBy: discordId,
                    updated: created,
                    updatedBy: discordId,
                    draft: false,
                    legacy: true,
                    card: result.card,
                    derived: deriveFields(result.card.text ?? ""),
                    tags: [],
                    // What any submitted suggestion carries - only `questions` is left for completing it to fill
                    pivotPoints: [],
                    comparableCards: [],
                    combosWith: [],
                    _metadata: { engagement: { reactions: {} } },
                    ...(match &&
                        !match.project.isDraft && {
                            archived: {
                                reason: "usedInProject",
                                project: { code: match.project.code, number: match.number },
                                archivedAt: now
                            }
                        })
                },
                { abortEarly: false }
            );
            if (error) {
                for (const detail of error.details) {
                    result.errors.push({ column: detail.path.join("."), message: detail.message });
                }
                continue;
            }
            documents.push(value as ICardSuggestion);
            if (match?.project.isDraft) {
                draftLinks.push({ document: value as ICardSuggestion, card: match });
            }
        }

        const failed = results.filter((result) => result.errors.length > 0);
        const ready = results.filter((result) => result.errors.length === 0);

        if (failed.length > 0) {
            log.section(`Failures (${failed.length})`);
            const lines: string[] = [];
            for (const result of failed) {
                lines.push(`Row ${result.row} · ${result.name} (${result.designer})`);
                for (const error of result.errors) {
                    lines.push(`    - [${error.column}] ${error.message}`);
                }
            }
            lines.forEach((line) => log.info(line));
            fs.writeFileSync(ERRORS_PATH, lines.join("\n") + "\n", "utf-8");
        } else if (fs.existsSync(ERRORS_PATH)) {
            fs.unlinkSync(ERRORS_PATH);
        }

        log.section("Summary");
        log.info(`Cards found:                  ${results.length + titles.length + noDesigner.length}`);
        log.info(`Ignored (Title):              ${titles.length}`);
        log.info(`Skipped (no designer):        ${noDesigner.length}`);
        log.info(`Failed:                       ${failed.length}`);
        log.info(`Ready to import:              ${ready.length}`);
        log.info(
            `    archived (used in a project):        ${documents.filter((document) => document.archived).length}`
        );
        log.info(`    linked from a draft project's card:  ${draftLinks.length}`);
        log.info(`    ambiguous, left to settle on site:   ${ambiguous}`);
        log.info("");
        printCreatedDates(ready, createdDates, sheetDates);
        log.info("");
        const readyCards = ready.map((result) => ({ result, card: result.card! }));
        printTally("By faction", tally(readyCards.map(({ card }) => ({ key: card.faction }))));
        printTally("By type", tally(readyCards.map(({ card }) => ({ key: card.type }))));
        printTally(
            "By designer",
            tally(readyCards.map(({ result }) => ({ key: designerNames.get(designerMap[result.designer])! })))
        );
        if (titles.length > 0) {
            log.info(
                `Ignored (Title): ${titles.map(({ row, name, designer }) => `row ${row} ${name} (${designer})`).join(", ")}`
            );
        }
        if (noDesigner.length > 0) {
            log.info(`Skipped (no designer): ${noDesigner.map(({ row, name }) => `row ${row} ${name}`).join(", ")}`);
        }

        if (failed.length > 0) {
            log.section("Not committed");
            log.error(`${failed.length} row(s) failed - fix them in the sheet and re-run. Nothing was written.`);
            log.info(`Failures also written to ${ERRORS_PATH}`);
            process.exitCode = 1;
            return;
        }
        if (documents.length === 0) {
            log.warn("Nothing to import");
            return;
        }

        // Without a terminal the question can never be answered, and would otherwise wait forever
        if (!process.stdin.isTTY) {
            log.warn("Not committed - run from an interactive terminal to answer the commit prompt");
            return;
        }
        const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await prompt.question(
            `\nCommit these ${documents.length} suggestions to ${environment}? (y/N) `
        );
        prompt.close();
        if (answer.trim().toLowerCase() !== "y") {
            log.warn("Not committed - nothing was written");
            return;
        }

        for (const document of documents) {
            document.id = crypto.randomUUID();
        }
        const inserted = await db.collection("suggestions").insertMany(documents);
        log.success(`Inserted ${inserted.insertedCount} legacy suggestion(s) into ${environment}`);
        for (const { document, card } of draftLinks) {
            await db.collection("cards").updateMany(
                {
                    project: card.project.number,
                    number: card.number,
                    ...(card.version && { version: card.version })
                },
                { $set: { suggestionId: document.id } }
            );
        }
        if (draftLinks.length > 0) {
            log.success(`Linked ${draftLinks.length} draft project card(s) to their suggestion`);
        }
    } finally {
        await client.close();
        await destroyDiscordClient();
    }
}

main().catch((err) => {
    log.error("Import failed", err);
    process.exit(1);
});
