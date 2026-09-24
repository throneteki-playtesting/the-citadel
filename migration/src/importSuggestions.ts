import "dotenv/config";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import readline from "readline/promises";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { Db, MongoClient } from "mongodb";
import { log } from "./lib/logger";
import { getArgValue } from "./lib/args";
import { ENVIRONMENTS, isEnvironment, resolveDatabase } from "./lib/environments";
import { destroyDiscordClient, fetchAllGuildMembers } from "./lib/discord";
import { CardSuggestion } from "../../common/models/schemas";
import { ABILITY_TEXT_SOURCE, deriveFields } from "../../common/designGuidelines/deriveFields";
import { encodeEntities } from "../../common/richText/format";
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

// One-off import of the design team's "Future Cards" sheet into draft suggestions. Nothing is written
// unless every row converts cleanly and the summary is confirmed at the prompt.

const SHEET_NAME = "Future Cards";
const DESIGNERS_PATH = path.resolve(process.cwd(), "designers.json");
const CARD_NAMES_PATH = path.resolve(process.cwd(), "card-names.json");
const ERRORS_PATH = path.resolve(process.cwd(), "import-suggestions-errors.txt");

const COLUMNS = {
    faction: "Faction",
    name: "Card Name",
    type: "Type",
    loyal: "Loyal",
    uniqueIncome: "Unique / Income",
    costInitiative: "Cost / Initiative",
    strengthClaim: "STR / Claim",
    iconsReserve: "Icons / Reserve",
    traits: "Traits",
    text: "Text",
    flavor: "Flavor Text",
    deckLimit: "Deck Limit",
    designer: "Designer"
} as const;
type Column = keyof typeof COLUMNS;

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

type Run = { text: string; bold: boolean; italic: boolean; strike: boolean };
type RowError = { column: string; message: string };

interface RowResult {
    row: number;
    name: string;
    designer: string;
    errors: RowError[];
    card?: ICard;
    /** Struck through in the sheet - already taken into a project, so imported as archived */
    struck: boolean;
    archivedTo?: ProjectCardRef;
}

type ProjectCardRef = { code: string; number: number };
type FirstVersion = ProjectCardRef & { name: string; faction: string };

const args = process.argv.slice(2);

// Google's export spells "not bold" as <b val="0"/>, which exceljs reads as bold (it only checks the
// element is present) - so every explicitly-off flag is removed before exceljs ever sees the file
const DISABLED_FONT_FLAG_REGEX = /<(b|i|strike)\s+val="(?:0|false)"\s*\/>/g;

async function loadWorkbook(file: string) {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    for (const entry of Object.values(zip.files)) {
        if (entry.name.startsWith("xl/") && entry.name.endsWith(".xml")) {
            const xml = await entry.async("string");
            zip.file(entry.name, xml.replace(DISABLED_FONT_FLAG_REGEX, ""));
        }
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await zip.generateAsync({ type: "arraybuffer" }));
    return workbook;
}

function normalise(text: string) {
    return text.replace(/\r\n?/g, "\n").replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
}

function readRuns(cell: ExcelJS.Cell): Run[] {
    const value = cell.value;
    const cellFont = cell.font ?? {};
    // A run's own bold/italic are authoritative (Google styles the cell after its first character, so the
    // cell font would bleed a leading trait across the whole text), but strikethrough is only ever set on
    // the cell, so that one is merged
    const run = (text: string, font: Partial<ExcelJS.Font> = cellFont): Run => ({
        text: normalise(text),
        bold: !!font.bold,
        italic: !!font.italic,
        strike: !!(font.strike || cellFont.strike)
    });

    if (value === null || value === undefined) {
        return [];
    }
    if (typeof value === "object" && "richText" in value) {
        return value.richText.map((part) => run(part.text, part.font));
    }
    if (typeof value === "object" && "text" in value) {
        return [run(String(value.text))];
    }
    if (typeof value === "object" && "result" in value) {
        return value.result === undefined ? [] : [run(String(value.result))];
    }
    return [run(String(value))];
}

function plain(runs: Run[]) {
    return runs
        .map((run) => run.text)
        .join("")
        .trim();
}

function isStruck(runs: Run[]) {
    return runs.some((run) => run.strike && run.text.trim() !== "");
}

function isBlank(value: string) {
    return value === "" || value === "-";
}

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

function convertRow(cells: Record<Column, Run[]>, errors: RowError[]): ICard | undefined {
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

function nameKey(name: string) {
    return normalise(name).toLowerCase().replace(/\s+/g, " ").trim();
}

function compareVersions(a: string, b: string) {
    const [left, right] = [a, b].map((version) => version.split(".").map(Number));
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        const difference = (left[index] ?? 0) - (right[index] ?? 0);
        if (difference !== 0) {
            return difference;
        }
    }
    return 0;
}

// Every card's first version, keyed by its name - that is the name it was taken into the project under
async function loadFirstVersions(db: Db) {
    const projects = await db
        .collection("projects")
        .find({}, { projection: { _id: 0, number: 1, code: 1 } })
        .toArray();
    const codes = new Map(projects.map((project) => [project.number as number, project.code as string]));

    const cards = await db
        .collection("cards")
        .find({}, { projection: { _id: 0, project: 1, number: 1, version: 1, name: 1, faction: 1 } })
        .toArray();

    const firsts = new Map<string, { version: string; card: FirstVersion }>();
    const versionNames = new Map<string, Set<string>>();
    for (const card of cards) {
        const code = codes.get(card.project) ?? `project ${card.project}`;
        const key = refKey(code, card.number);
        const existing = firsts.get(key);
        if (!existing || compareVersions(card.version, existing.version) < 0) {
            firsts.set(key, {
                version: card.version,
                card: { code, number: card.number, name: card.name, faction: card.faction }
            });
        }
        versionNames.set(key, (versionNames.get(key) ?? new Set()).add(nameKey(card.name)));
    }

    const byRef = new Map<string, FirstVersion>();
    const byName = new Map<string, FirstVersion[]>();
    const byAnyVersionName = new Map<string, FirstVersion[]>();
    for (const [key, { card }] of firsts) {
        byRef.set(key, card);
        byName.set(nameKey(card.name), [...(byName.get(nameKey(card.name)) ?? []), card]);
        for (const name of versionNames.get(key)!) {
            byAnyVersionName.set(name, [...(byAnyVersionName.get(name) ?? []), card]);
        }
    }
    return { byRef, byName, byAnyVersionName };
}

function refKey(code: string, number: number) {
    return `${code.toLowerCase()}#${number}`;
}

function describeCard(card: FirstVersion) {
    return `${card.code} #${card.number} "${card.name}" (${card.faction})`;
}

// A card-names.json entry is either the name the card went on to have (in any version), or "CODE #number"
// for when that name alone is still ambiguous. Returns false when there is no match to archive against.
function matchStruckCard(
    result: RowResult,
    firstVersions: Awaited<ReturnType<typeof loadFirstVersions>>,
    cardNames: Record<string, string>
) {
    const fail = (message: string) => {
        result.errors.push({ column: COLUMNS.name, message });
        return false;
    };

    const mapped = cardNames[result.name]?.trim();
    let candidates: FirstVersion[];
    if (mapped) {
        const ref = mapped.match(/^(.+?)\s*#(\d+)$/);
        if (ref) {
            const card = firstVersions.byRef.get(refKey(ref[1], parseInt(ref[2], 10)));
            if (!card) {
                return fail(`Mapped to "${mapped}" in card-names.json, but no such card exists`);
            }
            candidates = [card];
        } else {
            candidates = firstVersions.byAnyVersionName.get(nameKey(mapped)) ?? [];
            if (candidates.length === 0) {
                return fail(`Mapped to "${mapped}" in card-names.json, but no version of any card has that name`);
            }
        }
    } else {
        candidates = firstVersions.byName.get(nameKey(result.name)) ?? [];
        if (candidates.length === 0) {
            const renamed = firstVersions.byAnyVersionName.get(nameKey(result.name)) ?? [];
            return fail(
                renamed.length > 0
                    ? `Struck through, but no card's first version is named "${result.name}" - a later version of ${renamed.map(describeCard).join(", ")} is. Map it in card-names.json`
                    : `Struck through, but no card named "${result.name}" exists in the cards database. Map it in card-names.json`
            );
        }
    }

    if (candidates.length > 1 && result.card) {
        const sameFaction = candidates.filter((card) => card.faction === result.card!.faction);
        candidates = sameFaction.length > 0 ? sameFaction : candidates;
    }
    if (candidates.length > 1) {
        return fail(
            `Struck through, but "${mapped || result.name}" matches several cards: ${candidates.map(describeCard).join(", ")}. Map it to one as "CODE #number" in card-names.json`
        );
    }
    result.archivedTo = { code: candidates[0].code, number: candidates[0].number };
    return true;
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

    const { url, name: dbName } = resolveDatabase(environment);

    log.section("The Citadel - Import Suggestions");
    log.info(`File:        ${path.resolve(file)}`);
    log.info(`Environment: ${environment} (${dbName})`);

    const workbook = await loadWorkbook(file);
    const sheet = workbook.getWorksheet(SHEET_NAME);
    if (!sheet) {
        log.error(`Sheet "${SHEET_NAME}" not found`);
        return process.exit(1);
    }

    let headerRow: number | undefined;
    const columnIndex = {} as Record<Column, number>;
    sheet.eachRow((row, rowNumber) => {
        if (headerRow !== undefined) {
            return;
        }
        const headers = new Map<string, number>();
        row.eachCell((cell, col) => {
            headers.set(plain(readRuns(cell)), col);
        });
        if (headers.has(COLUMNS.name)) {
            headerRow = rowNumber;
            for (const [key, header] of Object.entries(COLUMNS) as [Column, string][]) {
                columnIndex[key] = headers.get(header) ?? -1;
            }
        }
    });

    if (headerRow === undefined) {
        log.error(`No header row containing "${COLUMNS.name}" found`);
        return process.exit(1);
    }
    const missingHeaders = (Object.keys(COLUMNS) as Column[]).filter((key) => columnIndex[key] === -1);
    if (missingHeaders.length > 0) {
        log.error(`Missing column(s): ${missingHeaders.map((key) => COLUMNS[key]).join(", ")}`);
        return process.exit(1);
    }

    const results: RowResult[] = [];
    const titles: { row: number; name: string; designer: string }[] = [];
    const noDesigner: { row: number; name: string }[] = [];

    for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber++) {
        const row = sheet.getRow(rowNumber);
        const cells = Object.fromEntries(
            (Object.keys(COLUMNS) as Column[]).map((key) => [key, readRuns(row.getCell(columnIndex[key]))])
        ) as Record<Column, Run[]>;

        const name = plain(cells.name);
        if (name === "") {
            continue;
        }
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
        results.push({ row: rowNumber, name, designer, errors, card, struck: isStruck(cells.name) });
    }
    const struck = results.filter((result) => result.struck);

    const designers = [...new Set(results.map((result) => result.designer))];
    const designerMap = readMapping(DESIGNERS_PATH);
    addMissingMappings(DESIGNERS_PATH, designerMap, designers, "fill in their Discord ids");

    const client = new MongoClient(url);
    try {
        await client.connect();
        const db = client.db(dbName);

        const ids = [...new Set(designers.map((designer) => designerMap[designer]).filter((id) => !!id))];
        const { names: designerNames, unresolved } = await resolveDiscordIds(ids, db);

        if (struck.length > 0) {
            const firstVersions = await loadFirstVersions(db);
            const cardNames = readMapping(CARD_NAMES_PATH);
            const unmatched = struck.filter((result) => !matchStruckCard(result, firstVersions, cardNames));
            addMissingMappings(
                CARD_NAMES_PATH,
                cardNames,
                unmatched.map((result) => result.name),
                'fill in the name each card went on to have, or "CODE #number"'
            );
        }

        const now = new Date();
        const documents: ICardSuggestion[] = [];
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

            const { value, error } = CardSuggestion.DraftSave.validate(
                {
                    created: now,
                    createdBy: discordId,
                    updated: now,
                    updatedBy: discordId,
                    draft: true,
                    card: result.card,
                    derived: deriveFields(result.card.text ?? ""),
                    tags: [],
                    _metadata: { engagement: { reactions: {} } },
                    ...(result.archivedTo && {
                        archived: { reason: "usedInProject", project: result.archivedTo, archivedAt: now }
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
        const readyArchived = ready.filter((result) => result.struck);
        log.info(`Cards found:                  ${results.length + titles.length + noDesigner.length}`);
        log.info(`Ignored (Title):              ${titles.length}`);
        log.info(`Skipped (no designer):        ${noDesigner.length}`);
        log.info(`Failed:                       ${failed.length}`);
        log.info(
            `Ready to import:              ${ready.length} (${readyArchived.length} archived as used in a project)`
        );
        log.info("");
        const readyCards = ready.map((result) => ({ result, card: result.card! }));
        printTally("By faction", tally(readyCards.map(({ card }) => ({ key: card.faction }))));
        printTally("By type", tally(readyCards.map(({ card }) => ({ key: card.type }))));
        printTally(
            "By designer",
            tally(readyCards.map(({ result }) => ({ key: designerNames.get(designerMap[result.designer])! })))
        );
        printTally(
            "Archived (struck through) by project",
            tally(readyArchived.map(({ archivedTo }) => ({ key: archivedTo!.code })))
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
        log.success(
            `Inserted ${inserted.insertedCount} draft suggestion(s) into ${environment}, ${readyArchived.length} of them archived`
        );
    } finally {
        await client.close();
        await destroyDiscordClient();
    }
}

main().catch((err) => {
    log.error("Import failed", err);
    process.exit(1);
});
