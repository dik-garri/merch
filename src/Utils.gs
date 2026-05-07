function nowISO() {
  return Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
}

function formatMoney(n) {
  return Number(n).toLocaleString('ru-RU') + 'с';
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function logEvent(level, action, message, meta) {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID()).getSheetByName('Logs');
    if (!sheet) return;
    sheet.appendRow([new Date(), level, action, message || '', meta ? JSON.stringify(meta) : '']);
  } catch (e) { /* never fail request */ }
}

function uid() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}
