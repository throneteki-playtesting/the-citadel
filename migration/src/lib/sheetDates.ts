import fs from "fs";
import path from "path";
import { Column, rowKey, RowValues } from "./futureCardsSheet";

// The "Future Cards" rows dated from the sheet's version history - written by analyseSheetHistory, read by the
// suggestion importer as each suggestion's created date

export const SHEET_DATES_PATH = path.resolve(process.cwd(), "sheet-row-dates.json");
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface SheetRowDate {
    /** The row as the latest version of the sheet has it - what the importer's own rows are linked to */
    values: RowValues;
    /** When the idea first reached the sheet - the snapshot this row, through every edit since, first appears in */
    date: string;
    /** The snapshot before - it arrived after this. Absent when the row predates the history entirely, in which case
     *  `date` is only the earliest it is known to exist by. */
    after?: string;
}

export interface SheetDates {
    fileId: string;
    generatedAt: string;
    fileCreated?: string;
    firstRevision: string;
    lastRevision: string;
    /** The columns rows are compared on */
    columns: Column[];
    /** Every row of the latest version, in sheet order */
    rows: SheetRowDate[];
}

export function readSheetDates(): SheetDates | undefined {
    return fs.existsSync(SHEET_DATES_PATH)
        ? (JSON.parse(fs.readFileSync(SHEET_DATES_PATH, "utf-8")) as SheetDates)
        : undefined;
}

export interface RevisionChange {
    /** Position among the revisions given */
    index: number;
    rows: number;
    /** Rows with no counterpart in the revision before - ideas arriving */
    added: number;
    /** Rows of the revision before with no counterpart here - ideas taken out */
    removed: number;
    /** Rows paired with one before them, but saying something different - ideas being worked on */
    edited: number;
}

// After an exact match, how else a row is recognised as the same idea from one version to the next - loosest last.
// Same text under a new name is a rename; the rest are edits to an idea that keeps its name.
const IDENTITY_PASSES: Column[][] = [["faction", "name", "type"], ["name"], ["faction", "type", "text"]];

/** Pairs each row of `newer` with the row of `older` it continues - by exact content, then by identity alone, so
 *  an edit carries a row forward rather than reading as a new one. Duplicates pair in sheet order. */
export function linkRows(older: RowValues[], newer: RowValues[], columns: Column[]) {
    const links: (number | undefined)[] = newer.map(() => undefined);
    const unclaimed = new Set(older.keys());
    const passes = [columns, ...IDENTITY_PASSES.map((pass) => pass.filter((column) => columns.includes(column)))];
    for (const pass of passes) {
        if (pass.length === 0) {
            continue;
        }
        // A blank in the identity would pair every blank with every other - such a row isn't recognisable by it
        const keyOf = (row: RowValues) => (pass.some((column) => row[column] === "") ? undefined : rowKey(row, pass));
        const waiting = new Map<string, number[]>();
        for (const index of unclaimed) {
            const key = keyOf(older[index]);
            if (key !== undefined) {
                waiting.set(key, [...(waiting.get(key) ?? []), index]);
            }
        }
        newer.forEach((row, index) => {
            const key = links[index] === undefined ? keyOf(row) : undefined;
            const match = key !== undefined ? waiting.get(key)?.shift() : undefined;
            if (match !== undefined) {
                links[index] = match;
                unclaimed.delete(match);
            }
        });
    }
    return links;
}

/** Dates every row of the last revision to the first revision it's traced back to, comparing each pair only on
 *  the columns both have. A row there from the very first revision predates the history, so has no `after`. */
export function firstAppearances(revisions: { time: string; rows: RowValues[]; columns: Column[] }[]) {
    const last = revisions.length - 1;
    const latest = revisions[last];
    const arrivedAt = latest.rows.map(() => 0);
    const timeline: RevisionChange[] = [];

    // Where each latest row is, in the revision currently being stepped back from
    let traced = new Map(latest.rows.map((_, index) => [index, index]));
    for (let index = last - 1; index >= 0; index--) {
        const older = revisions[index];
        const newer = revisions[index + 1];
        const shared = older.columns.filter((column) => newer.columns.includes(column));
        const links = linkRows(older.rows, newer.rows, shared);

        const paired = links.filter((link) => link !== undefined).length;
        const edited = links.filter(
            (link, row) => link !== undefined && rowKey(older.rows[link], shared) !== rowKey(newer.rows[row], shared)
        ).length;
        timeline.unshift({
            index: index + 1,
            rows: newer.rows.length,
            added: newer.rows.length - paired,
            removed: older.rows.length - paired,
            edited
        });

        const earlier = new Map<number, number>();
        for (const [row, position] of traced) {
            const link = links[position];
            if (link === undefined) {
                arrivedAt[row] = index + 1;
            } else {
                earlier.set(row, link);
            }
        }
        traced = earlier;
    }
    timeline.unshift({
        index: 0,
        rows: revisions[0].rows.length,
        added: revisions[0].rows.length,
        removed: 0,
        edited: 0
    });

    const rows: SheetRowDate[] = latest.rows.map((values, row) => {
        const index = arrivedAt[row];
        return { values, date: revisions[index].time, ...(index > 0 && { after: revisions[index - 1].time }) };
    });
    return { rows, timeline };
}
