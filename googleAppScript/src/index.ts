import { Log } from "./cloudLogger";
import * as Router from "./router";
import * as Spreadsheet from "./spreadsheets/spreadsheet";
import * as Form from "./forms/form";
import { getProjectDetails, getProperty, GooglePropertiesType } from "./settings";
import { post, setAPIKey } from "./restClient";
import { runTests } from "./test/tests";

// Set up tests as first function
global.runTests = runTests;

// Simple Triggers (does not need additional setup)
global.onOpen = Spreadsheet.onOpen;
///////////////////////////////////////////////////
// Complex Triggers (requires setup on Apps Script end)
global.onEdited = Spreadsheet.onEdit;
global.onFormSubmit = Form.onSubmit;
///////////////////////////////////////////////////

// Runnable functions
global.initialiseProject = () => {
    // Setup complex triggers (only if not already existing)
    const existing = ScriptApp.getProjectTriggers();
    if (!existing.some((trigger) => trigger.getHandlerFunction() === "onFormSubmit")) {
        ScriptApp.newTrigger("onFormSubmit")
            .forForm(getProperty(GooglePropertiesType.Script, "formId"))
            .onFormSubmit()
            .create();
    }
    if (!existing.some((trigger) => trigger.getHandlerFunction() === "onEdited") && SpreadsheetApp.getActiveSpreadsheet()) {
        ScriptApp.newTrigger("onEdited")
            .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
            .onEdit()
            .create();
    }
    const project = getProjectDetails();
    post("projects", [project]);
    Log.information(`Project initialised: ${project.name} (${project.number})`);
};
global.setAPIKey = setAPIKey;

global.processPendingEdits = () => {
    for (const sheet of Object.values(Spreadsheet.DataSheet.sheets)) {
        sheet.processPendingEdits();
    }
};

global.processAllLatest = () => {
    Spreadsheet.DataSheet.sheets.latest.processAll();
};

// Router doGet & doPost
global.doGet = Router.doGet;
global.doPost = Router.doPost;