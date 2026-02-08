const SHEET_NAME = "Sheet1";
const SAVE_VERSION = 1;

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];

  const idIndex = headers.indexOf("id");
  const nameIndex = headers.indexOf("name");
  const stateIndex = headers.indexOf("state");
  const updatedIndex = headers.indexOf("updated");
  const versionIndex = headers.indexOf("version");
  const backupIndex = headers.indexOf("backup");

  if (data.action === "save") {
    const incomingState = data.state;

    // === Basic anti-cheat ===
    if (incomingState.money > 1e15) {
      return output({ error: "Money too high" });
    }

    let rowIndex = -1;

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][idIndex] === data.account.id) {
        rowIndex = i + 1;
        break;
      }
    }

    const stateString = JSON.stringify(incomingState);

    if (rowIndex === -1) {
      sheet.appendRow([
        data.account.id,
        data.account.name,
        stateString,
        new Date(),
        SAVE_VERSION,
        ""
      ]);
    } else {
      const oldState = sheet.getRange(rowIndex, stateIndex + 1).getValue();
      sheet.getRange(rowIndex, backupIndex + 1).setValue(oldState);
      sheet.getRange(rowIndex, stateIndex + 1).setValue(stateString);
      sheet.getRange(rowIndex, updatedIndex + 1).setValue(new Date());
      sheet.getRange(rowIndex, versionIndex + 1).setValue(SAVE_VERSION);
    }

    return output({ status: "saved" });
  }
}

function doGet(e) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];

  const idIndex = headers.indexOf("id");
  const stateIndex = headers.indexOf("state");
  const nameIndex = headers.indexOf("name");

  if (e.parameter.action === "load") {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][idIndex] === e.parameter.id) {
        return output({ state: JSON.parse(rows[i][stateIndex]) });
      }
    }
  }

  if (e.parameter.action === "leaderboard") {
    const leaderboard = [];

    for (let i = 1; i < rows.length; i++) {
      const state = JSON.parse(rows[i][stateIndex] || "{}");
      leaderboard.push({
        name: rows[i][nameIndex],
        prestige: state.prestige || 0,
        totalLaps: state.totalLaps || 0
      });
    }

    leaderboard.sort((a, b) => b.prestige - a.prestige);

    return output({ leaderboard: leaderboard.slice(0, 10) });
  }

  return output({});
}

function output(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
