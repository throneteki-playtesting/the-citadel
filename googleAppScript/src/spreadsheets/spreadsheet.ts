import { Log } from "../cloudLogger";
import { CardSerializer } from "./serializers/cardSerializer";
import { getProperty, GooglePropertiesType } from "../settings";
import { ReviewSerializer } from "./serializers/reviewSerializer";
import { DataSerializer } from "./serializers/dataSerializer";
import { titleCase } from "common/utils";
import { post } from "../restClient";
import { safelyGetUI } from "./userInput";
import { DeepPartial } from "common/types";

export class DataSheet<Model> {
    public static sheets = {
        latest: new DataSheet("Latest Cards", "cards", "static", CardSerializer.instance),
        archive: new DataSheet("Archived Cards", "cards", "dynamic", CardSerializer.instance),
        review: new DataSheet("Archived Reviews", "reviews", "dynamic", ReviewSerializer.instance)
    };

    public sheet: GoogleAppsScript.Spreadsheet.Sheet;
    private firstRow: number;
    private firstColumn: number;
    private maxColumns: number;
    private maxRows: number;

    constructor(sheetName: string,
        private resource: "cards" | "reviews" | "other",
        private type: "static" | "dynamic" = "dynamic",
        private serializer: DataSerializer<Model>
    ) {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
        if (!sheet) {
            throw Error(`Failed to find sheet '${sheetName}'`);
        }
        this.sheet = sheet;

        this.firstRow = sheet.getFrozenRows() + 1;
        this.firstColumn = 2;
        this.maxColumns = (sheet.getLastColumn() + 1) - this.firstColumn;
        this.maxRows = (sheet.getLastRow() + 1) - this.firstRow;
    }

    public isFor(sheet: GoogleAppsScript.Spreadsheet.Sheet) {
        return this.sheet.getSheetId() === sheet.getSheetId();
    }

    public create(models: Model[]) {
        if (models.length > 0 && this.type === "static") {
            throw Error(`You cannot create rows on static data sheet "${this.sheet.getName()}"`);
        }

        if (models.length === 0) {
            return [];
        }

        // Default number of template rows is 1.
        // Only inserts if there is already data (eg. does not insert for first value, as this is consumed by template row)
        const insertingRows = models.length - Math.max(0, (this.firstRow - this.sheet.getLastRow()));
        const lastRow = this.sheet.getLastRow();
        if (insertingRows > 0) {
            // Insert rows after current last row
            this.sheet.insertRowsAfter(Math.max(lastRow, this.firstRow), insertingRows);
            const insertedRange = this.sheet.getRange(lastRow + 1, this.firstColumn, insertingRows, this.maxColumns);

            // Copy the template row format into the newly inserted range (note: this isn't working as expected for borders)
            const templateRange = this.sheet.getRange(this.firstRow, this.firstColumn, 1, this.maxColumns);
            templateRange.copyTo(insertedRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
        }

        const richTextValues = models.map((model) => toRichTextValues(this.serializer.serialize(model)));
        this.sheet.getRange(lastRow + 1, this.firstColumn, richTextValues.length, this.maxColumns).setRichTextValues(richTextValues);

        Log.information(`Created ${richTextValues.length} rows in ${this.sheet.getName()}`);
        return models;
    }

    public read(filter: (values: string[], index: number, model?: Model | DeepPartial<Model>) => boolean = this.serializer.filter) {
        const start = new Date();
        // TODO: Save current filter, unapply, then reapply when finished reading
        if (this.maxRows <= 0) {
            return [];
        }

        // Fetch all rows (as needs to be filtered)
        const range = this.sheet.getRange(this.firstRow, this.firstColumn, this.maxRows, this.maxColumns);
        const richTextValueMatrix = range.getRichTextValues();
        const valueMatrix = range.getValues().map((row) => row.map((col) => col as string));

        const result: Model[] = [];
        for (let i = 0 ; i < valueMatrix.length ; i++) {
            const values = valueMatrix[i];
            // Only get row if matches filter
            if (filter(values, i)) {
                const rowValues: string[] = [];

                const richTextValues = richTextValueMatrix[i];
                for (let j = 0 ; j < values.length ; j++) {
                    const richTextValue = richTextValues[j];
                    if (!this.serializer.richTextColumns.includes(j) || richTextValue === null || richTextValue.getText() === "") {
                        const value = values[j];
                        rowValues.push(value);
                    } else {
                        rowValues.push(toString(richTextValue));
                    }
                }

                result.push(this.serializer.deserialize(rowValues, i));
            }
        }

        const end = new Date();
        Log.information(`Read ${result.length} rows from ${this.sheet.getName()} in ${end.getTime() - start.getTime()}ms`);
        return result;
    }

    public update(models: Model[], firstOnly = false, upsert = false) {
        // TODO: Save current filter, unapply, then reapply when finished reading
        if (models.length === 0) {
            return [];
        }
        const updated: Model[] = [];

        if (this.maxRows > 0) {
            // Fetch all rows (as needs to be filtered)
            const range = this.sheet.getRange(this.firstRow, this.firstColumn, this.maxRows, this.maxColumns);
            const valueMatrix = range.getValues().map((row) => row.map((col) => col as string));

            const setMap = new Map<number, string[][]>();
            for (let i = 0 ; i < valueMatrix.length ; i++) {
                const values = valueMatrix[i];

                let startRow: number;
                const matched = models.find((model) => this.serializer.matches(values, i, model as DeepPartial<Model>));
                if (matched && (!firstOnly || !updated.includes(matched))) {
                    startRow = startRow || (this.firstRow + i);
                    const group: string[][] = setMap[startRow] || [];
                    const rowValues = this.serializer.serialize(matched);
                    group.push(rowValues);
                    setMap.set(startRow, group);

                    updated.push(matched);
                } else if (startRow !== undefined) {
                    startRow = undefined;
                }
            }

            let totalGroups = 0;
            for (const [startRow, values] of Array.from(setMap.entries())) {
                totalGroups++;
                const richTextValues = values.map((row) => {
                    const rowRichTextValues: GoogleAppsScript.Spreadsheet.RichTextValue[] = [];
                    for (let j = 0 ; j < row.length ; j++) {
                        const value = row[j];
                        if (!this.serializer.richTextColumns.includes(j) || value === null || value === "") {
                            rowRichTextValues.push(SpreadsheetApp.newRichTextValue().setText(value || "").build());
                        } else {
                            rowRichTextValues.push(toRichTextValue(value));
                        }
                    }
                    return rowRichTextValues;
                });
                this.sheet.getRange(startRow, this.firstColumn, values.length, this.maxColumns).setRichTextValues(richTextValues);
            }

            Log.information(`Updated ${updated.length} rows (${totalGroups} groups) in ${this.sheet.getName()}`);
        }

        if (upsert) {
            const missing = models.filter((model) => !updated.includes(model));
            updated.push(...this.create(missing));
        }
        return updated;
    }

    public delete(filter: (values: string[], index: number, model?: DeepPartial<Model>) => boolean = this.serializer.filter) {
        if (this.maxRows <= 0) {
            return [];
        }

        // Fetch all rows (as needs to be filtered)
        const range = this.sheet.getRange(this.firstRow, this.firstColumn, this.maxRows, this.maxColumns);
        const richTextValueMatrix = range.getRichTextValues();
        const valueMatrix = range.getValues();

        const deleted: Model[] = [];
        const setMap = new Map<number, unknown[]>();
        let startGroupRow: number;
        for (let i = 0 ; i < valueMatrix.length ; i++) {
            const values = valueMatrix[i];

            if (filter(values, i)) {
                if (this.type === "static") {
                    throw Error(`You cannot delete rows on static data sheet "${this.sheet.getName()}"`);
                }
                startGroupRow = startGroupRow || (this.firstRow + i);
                const group: unknown[] = setMap.get(startGroupRow) || [];
                group.push(values);
                setMap.set(startGroupRow, group);

                // Build deleting row to send back as result
                const rowValues: string[] = [];
                const richTextValues = richTextValueMatrix[i];
                for (let j = 0 ; j < values.length ; j++) {
                    const richTextValue = richTextValues[j];
                    if (!this.serializer.richTextColumns.includes(j) || richTextValue === null || richTextValue.getText() === "") {
                        const value = values[j];
                        rowValues.push(value);
                    } else {
                        rowValues.push(toString(richTextValue));
                    }
                }
                deleted.push(this.serializer.deserialize(rowValues, i));
            } else if (startGroupRow !== undefined) {
                startGroupRow = undefined;
            }
        }

        let totalGroups = 0;
        // Delete backwards to ensure higher row deletions are not affecting lower row deletions
        for (const [startRow, values] of Array.from(setMap.entries()).reverse()) {
            totalGroups++;
            // If template row is to be "deleted", instead clear it
            if (startRow === this.firstRow) {
                this.sheet.getRange(startRow, this.firstColumn, 1, this.maxColumns).clearContent();
                if (values.length > 1) {
                    this.sheet.deleteRows(startRow + 1, values.length - 1);
                }
            } else {
                this.sheet.deleteRows(startRow, values.length);
            }
        }

        Log.information(`Deleted ${deleted.length} rows (${totalGroups} groups) in ${this.sheet.getName()}`);
        return deleted;
    }

    public convertToDataRowNum(sheetRow: number) {
        return sheetRow - this.firstRow + 1;
    }

    /* LISTENER METHODS */
    public onEdit(e: GoogleAppsScript.Events.SheetsOnEdit) {
        const editDate = (new Date()).toUTCString();

        // Cache the latest edit into either an existing or new "batchEdit" variable
        const cache = CacheService.getDocumentCache();
        const cacheKey = `editBatch_${this.sheet.getName()}`;
        const editBatch = cache.get(cacheKey);
        const rangeString = `${this.convertToDataRowNum(e.range.getRowIndex())}:${this.convertToDataRowNum(e.range.getRowIndex() + e.range.getNumRows() - 1)}`;
        let value = `${editDate}|`;
        if (editBatch) {
            const editRanges = editBatch.split("|")[1].split(",");
            if (!editRanges.includes(rangeString)) {
                editRanges.push(rangeString);
            }
            value += editRanges.join(",");
        } else {
            value += rangeString;
        }
        cache.put(cacheKey, value);

        // Wait...
        const cooldown = parseInt(getProperty(GooglePropertiesType.Script, "editCooldown")) * 1000;
        Utilities.sleep(cooldown);

        // Then check if edits should be pushed
        const latestBatchEdit = cache.get(cacheKey);
        const [lastEditDate] = latestBatchEdit?.split("|") || [];
        // If this edit's date is the current batch date, then it is the most recent change
        if (lastEditDate && lastEditDate === editDate) {
            Log.information(`Automatically processing pending edits for ${this.sheet.getName()}...`);
            this.processPendingEdits();
        }
    }

    public processPendingEdits() {
        Log.information(`Manually processing pending edits for ${this.sheet.getName()}...`);
        const cache = CacheService.getDocumentCache();
        const cacheKey = `editBatch_${this.sheet.getName()}`;
        const latestBatchEdit = cache.get(cacheKey);
        const [lastEditDate, rangesString] = latestBatchEdit?.split("|") || [];
        if (lastEditDate) {
            cache.remove(cacheKey);
            const editRanges = rangesString.split(",").map((str) => {
                const [from, to] = str.split(":");
                return { from: parseInt(from), to: parseInt(to) };
            });
            const edited = this.read((values: unknown[], index: number) => editRanges.some(({ from, to }) => (index + 1) >= from && (index + 1) <= to));
            if (edited.length > 0) {
                const subUrl = this.resource;
                const response = post(subUrl, edited);
                Log.information(`${titleCase(this.resource)} - Posted ${response.updated} update(s)`);
            }
        }
    }

    public processAll() {
        Log.information(`Manually processing all ${this.sheet.getName()}...`);
        const processing = this.read(() => true);
        const subUrl = this.resource;
        const response = post(subUrl, processing);
        Log.information(`${titleCase(this.resource)} - Posted ${response.updated} rows(s)`);
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function toStrings(values: GoogleAppsScript.Spreadsheet.RichTextValue[]): string[] {
    return values.map((value) => toString(value));
}

function toRichTextValues(values: string[]): GoogleAppsScript.Spreadsheet.RichTextValue[] {
    return values.map((value) => toRichTextValue(value));
}

function toString(value: GoogleAppsScript.Spreadsheet.RichTextValue): string {
    try {
        return parseToHTML(value);
    } catch (err) {
        throw Error(`Failed to serialise column with value "${value.getText()}": ${err}`);
    }
}

function toRichTextValue(value: string): GoogleAppsScript.Spreadsheet.RichTextValue {
    const richTextValue = parseFromHTML(value);
    return richTextValue;
}

function parseToHTML(richTextValue: GoogleAppsScript.Spreadsheet.RichTextValue): string {
    let htmlString = "";

    const isTrait = (ts: GoogleAppsScript.Spreadsheet.TextStyle) =>
        ts.isBold()
    && ts.isItalic()
    && !ts.isStrikethrough()
    && !ts.isUnderline();

    const isTriggeredAbility = (ts: GoogleAppsScript.Spreadsheet.TextStyle) =>
        ts.isBold()
    && !ts.isItalic()
    && !ts.isStrikethrough()
    && !ts.isUnderline();

    const hasLink = (rtv: GoogleAppsScript.Spreadsheet.RichTextValue) =>
        rtv.getLinkUrl() !== null;

    for (const run of richTextValue.getRuns() ?? []) {
        let text = run.getText();
        const style = run.getTextStyle();

        // Regex to gather only the text portion of the string, whilst leaving the trim/newlines untouched
        const regex = /([^ \n]+(?: [^ \n]+)*)/g;
        if (isTrait(style)) {
            text = text.replace(regex, "<i>$1</i>");
        } else if (isTriggeredAbility(style)) {
            text = text.replace(regex, "<b>$1</b>");
        }
        // Adding link (alongside styling)
        if (hasLink(run)) {
            text = text.replace(regex, `<a href="${run.getLinkUrl()}">$1</a>`);
        }

        // // Replacing new-line with break
        // text = text.replace(/\n/g, "<br>");
        // Replacing icons
        text = text.replace(/:(\w+):/g, "[$1]");
        // Replacing citing
        text = text.replace(/(?<=" )[-~]\s+([\w ]+)/g, "<cite>$1</cite>");
        htmlString += text;
    }

    return htmlString;
}

function parseFromHTML(value: string): GoogleAppsScript.Spreadsheet.RichTextValue {
    const regex = /(?:<\s*([^\s>]+)(?:\s+href="([^"]+)")?\s*>)?(?<!<)([^<>]+)?(?!>)(?:<\s*\/[^>]+\s*>)?/gm;
    const textStyles: {
        startOffset: number,
        endOffset: number,
        textStyle: GoogleAppsScript.Spreadsheet.TextStyle | null,
        link: string | null
    }[] = [];
    let fullText = "";

    let groups: RegExpExecArray | null;
    while ((groups = regex.exec(value)) !== null) {
        if (groups.index === regex.lastIndex) {
            regex.lastIndex++;
        }

        const element = groups[1];
        const href = groups[2];
        const text = groups[3] || "";
        switch (element) {
            case "a":
                textStyles.push({
                    startOffset: fullText.length,
                    endOffset: fullText.length + text.length,
                    textStyle: null,
                    link: href
                });
                fullText += text;
                break;
            case "i":
                textStyles.push({
                    startOffset: fullText.length,
                    endOffset: fullText.length + text.length,
                    textStyle: SpreadsheetApp.newTextStyle().setBold(true).setItalic(true).build(),
                    link: null
                });
                fullText += text;
                break;
            case "b":
                textStyles.push({
                    startOffset: fullText.length,
                    endOffset: fullText.length + text.length,
                    textStyle: SpreadsheetApp.newTextStyle().setBold(true).build(),
                    link: null
                });
                fullText += text;
                break;
            case "cite":
                fullText += "- " + text;
                break;
            default:
                fullText += text;
        }
    }

    // Converts all [icons] into :icons:
    fullText = fullText.replace(/\[([^\]]+)\]/g, ":$1:");

    let builder = SpreadsheetApp.newRichTextValue().setText(fullText);
    for (const ts of textStyles) {
        if (ts.textStyle) {
            builder = builder.setTextStyle(ts.startOffset, ts.endOffset, ts.textStyle);
        }
        if (ts.link) {
            builder = builder.setLinkUrl(ts.startOffset, ts.endOffset, ts.link);
        }
    }

    return builder.build();
}

export function onEdit(e: GoogleAppsScript.Events.SheetsOnEdit) {
    const sheet = e.range.getSheet();
    const dataSheet = Array.from(Object.values(DataSheet.sheets)).find((ds) => ds.isFor(sheet));
    if (dataSheet) {
        dataSheet.onEdit(e);
    }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function onOpen(e: GoogleAppsScript.Events.SheetsOnOpen) {
    // Add UI (if able)
    const ui = safelyGetUI();
    if (ui) {
        ui.createMenu("Admin Tools")
            .addItem("Set API key", "setAPIKey")
            .addItem("Initialise/Sync Project", "initialiseProject")
            .addSubMenu(
                ui.createMenu("Changes/Editing")
                    .addItem("Push spreadsheet changes", "processPendingEdits")
                    .addItem("Push all latest", "processAllLatest")
            )
        //     // .addSubMenu(
        //     //     ui.createMenu("Development")
        //     //         .addSubMenu(
        //     //             ui.createMenu("Finalize Dev Update")
        //     //                 .addItem("1. Sync Github Issues", "finalizeIssues")
        //     //                 .addItem("2. Sync Pull Requests", "finalizePullRequest")
        //     //                 .addItem("3. Generate JSON Data", "openJSONDevDialog")
        //     //                 .addItem("4. Generate Update Notes (Unimplemented)", "openUpdateNotesDialog")
        //     //                 .addItem("5. Archive Cards", "archivePlaytestingUpdateCards")
        //     //                 .addItem("6. Increment Project Version", "incrementProjectVersion")
        //     //         )
        //     //         .addSubMenu(
        //     //             ui.createMenu("Individual Tasks")
        //     //                 .addItem("Generate JSON Data", "openJSONDevDialog")
        //     //                 .addItem("Sync Reviews", "syncReviews")
        //     //                 .addItem("Sync Github Issues", "syncIssues")
        //     //                 .addItem("Sync Pull Requests", "syncPullRequests")
        //     //                 .addItem("Archive Cards", "archivePlaytestingUpdateCards")
        //     //                 .addItem("Update Form Cards", "updateFormCards")
        //     //                 .addItem("Increment Project Version", "incrementProjectVersion")
        //     //                 .addSubMenu(
        //     //                     ui.createMenu("Generate Card Images")
        //     //                         .addItem("All Digital Images (PNG)", "syncDigitalCardImages")
        //     //                         .addItem("Some Digital Images (PNG)", "syncSomeDigitalCardImages")
        //     //                         .addItem("Print Sheet (PDF)", "openPDFSheetsDialog")
        //     //                 )
        //     //                 .addItem("Generate Update Notes", "openUpdateNotesDialog")
        //     //                 .addItem("Test", "testMulti")
        //     //         ).addSubMenu(
        //     //             ui.createMenu("Edit Stored Data")
        //     //                 .addItem("Script Data", "editScriptProperties")
        //     //                 .addItem("Document Data", "editDocumentProperties")
        //     //                 .addItem("User Data", "editUserProperties")
        //     //         )
        //     // )
        //     // .addSubMenu(
        //     //     ui.createMenu("Release Tools")
        //     //         .addItem("Validate & Export JSON", "openJSONReleaseDialog")
        //     // )
        //     // .addSubMenu(
        //     //     ui.createMenu("Config")
        //     //         .addItem("WebApp API Credentials", "updateWebAppCredentials")
        //     // )
            .addToUi();
    }
}