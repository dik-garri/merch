function getSheet(name) {
  var sheet = SpreadsheetApp.openById(SHEET_ID()).getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function getAllRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
}

function rowsAsObjects(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  return rows.map(function(r) {
    var o = {};
    headers.forEach(function(h, i) { o[h] = r[i]; });
    return o;
  });
}

function findRowByColumn(sheet, header, value) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = headers.indexOf(header);
  if (col < 0) throw new Error('Column not found: ' + header);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][col]) === String(value)) return i + 1;
  }
  return -1;
}

function updateRow(sheet, rowNumber, partial) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  headers.forEach(function(h, i) {
    if (Object.prototype.hasOwnProperty.call(partial, h)) row[i] = partial[h];
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

function appendObject(sheet, obj) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(h) { return obj[h] != null ? obj[h] : ''; });
  sheet.appendRow(row);
}
