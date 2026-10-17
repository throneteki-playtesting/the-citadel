import crypto from "crypto";
import fs from "fs";
import ExcelJS from "exceljs";
import JSZip from "jszip";

// The design team's "Future Cards" sheet, as read by both the suggestion importer and the analysis of the sheet's
// version history - one reading of it, so a row means the same thing to both.

export const SHEET_NAME = "Future Cards";

export const COLUMNS = {
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
export type Column = keyof typeof COLUMNS;

// What earlier versions of the sheet called the same columns - only its version history ever reads these
const FORMER_COLUMN_NAMES: Partial<Record<Column, string[]>> = {
    loyal: ["Loyal/Gold"],
    uniqueIncome: ["Unique/Gold", "Unique"],
    costInitiative: ["Cost/Init.", "Cost"],
    strengthClaim: ["STR/Claim", "STR"],
    iconsReserve: ["Icons/Res.", "Icons"],
    text: ["Keywords & Text"]
};
const FORMER_KEYWORDS_COLUMN = "Keywords";
export const COLUMN_KEYS = Object.keys(COLUMNS) as Column[];

export type Run = { text: string; bold: boolean; italic: boolean };
export type SheetCells = Record<Column, Run[]>;
export type RowValues = Record<Column, string>;

export interface SheetRow {
    row: number;
    cells: SheetCells;
}

export interface ReadSheet {
    rows: SheetRow[];
    /** Columns this version of the sheet has no header for - their cells read as empty */
    missing: Column[];
}

// Google's export spells "not bold" as <b val="0"/>, which exceljs reads as bold (it only checks the
// element is present) - so every explicitly-off flag is removed before exceljs ever sees the file
const DISABLED_FONT_FLAG_REGEX = /<(b|i)\s+val="(?:0|false)"\s*\/>/g;

export async function loadWorkbook(source: string | Buffer) {
    const zip = await JSZip.loadAsync(typeof source === "string" ? fs.readFileSync(source) : source);
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

export function normalise(text: string) {
    return text.replace(/\r\n?/g, "\n").replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
}

export function readRuns(cell: ExcelJS.Cell): Run[] {
    const value = cell.value;
    const cellFont = cell.font ?? {};
    // A run's own bold/italic are authoritative - Google styles the cell after its first character, so the cell
    // font would bleed a leading trait across the whole text
    const run = (text: string, font: Partial<ExcelJS.Font> = cellFont): Run => ({
        text: normalise(text),
        bold: !!font.bold,
        italic: !!font.italic
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

export function plain(runs: Run[]) {
    return runs
        .map((run) => run.text)
        .join("")
        .trim();
}

/** The worksheet holding the cards - by name, or else the first whose header row names a card column, since a
 *  past version may have called it something else */
export function findSheet(workbook: ExcelJS.Workbook) {
    return workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets.find((sheet) => findHeader(sheet) !== undefined);
}

function findHeader(sheet: ExcelJS.Worksheet) {
    let header: { row: number; columns: Map<string, number> } | undefined;
    sheet.eachRow((row, rowNumber) => {
        if (header) {
            return;
        }
        const columns = new Map<string, number>();
        row.eachCell((cell, col) => {
            columns.set(plain(readRuns(cell)), col);
        });
        if (columns.has(COLUMNS.name)) {
            header = { row: rowNumber, columns };
        }
    });
    return header;
}

/** Every row naming a card, read by header rather than position - undefined without a header row at all */
export function readSheet(sheet: ExcelJS.Worksheet): ReadSheet | undefined {
    const header = findHeader(sheet);
    if (!header) {
        return undefined;
    }
    const columnIndex = Object.fromEntries(
        COLUMN_KEYS.map((key) => {
            const name = [COLUMNS[key], ...(FORMER_COLUMN_NAMES[key] ?? [])].find((entry) => header.columns.has(entry));
            return [key, name ? header.columns.get(name)! : -1];
        })
    ) as Record<Column, number>;
    const missing = COLUMN_KEYS.filter((key) => columnIndex[key] === -1);
    // Until early 2024 keywords had a column of their own, since merged into the front of Text - read together, so
    // the merge isn't every row changing at once. The current sheet has no such column.
    const keywordsIndex = header.columns.get(FORMER_KEYWORDS_COLUMN);

    const rows: SheetRow[] = [];
    for (let rowNumber = header.row + 1; rowNumber <= sheet.rowCount; rowNumber++) {
        const row = sheet.getRow(rowNumber);
        const cells = Object.fromEntries(
            COLUMN_KEYS.map((key) => [key, columnIndex[key] === -1 ? [] : readRuns(row.getCell(columnIndex[key]))])
        ) as SheetCells;
        const keywords = keywordsIndex === undefined ? [] : readRuns(row.getCell(keywordsIndex));
        if (!isBlank(plain(keywords))) {
            cells.text = [...keywords, { text: " ", bold: false, italic: false }, ...cells.text];
        }
        if (plain(cells.name) !== "") {
            rows.push({ row: rowNumber, cells });
        }
    }
    return { rows, missing };
}

export function isBlank(value: string) {
    return value === "" || value === "-";
}

/** Each column's text as compared between versions of the sheet, never imported - levelling what it once swept
 *  across every row at once (whitespace, case, #...#/*...* markers, "Non-Unique" for "-") */
export function rowValues(cells: SheetCells) {
    return Object.fromEntries(
        COLUMN_KEYS.map((key) => {
            const value = plain(cells[key]).replace(/[#*]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
            return [key, key === "uniqueIncome" && value === "non-unique" ? "-" : value];
        })
    ) as RowValues;
}

/** What a row says, over the given columns - the same wherever the row has moved to, and different after any edit
 *  to those columns */
export function rowKey(values: RowValues, columns: Column[]) {
    return crypto
        .createHash("sha1")
        .update(JSON.stringify(columns.map((key) => values[key] ?? "")))
        .digest("base64url")
        .slice(0, 16);
}
