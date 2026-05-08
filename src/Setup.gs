function setupSheets() {
  var ss = SpreadsheetApp.openById(SHEET_ID());

  function ensure(name, headers) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    return sheet;
  }

  ensure('Categories', ['id', 'title', 'order']);
  ensure('Products',   ['id', 'category', 'title', 'description', 'sizes', 'price', 'drive_file_id', 'active']);
  ensure('Carts',      ['chat_id', 'product_id', 'size', 'qty', 'added_at']);
  ensure('Orders',     ['order_id', 'chat_id', 'name', 'phone', 'address', 'comment',
                        'items_json', 'total', 'status', 'receipt_file_id', 'receipt_kind',
                        'reject_reason', 'created_at', 'updated_at']);
  ensure('Users',      ['chat_id', 'username', 'first_name', 'last_seen']);
  ensure('Logs',       ['ts', 'level', 'action', 'message', 'meta_json']);

  return 'Sheets ready';
}

function setWebhook() {
  var url = ScriptApp.getService().getUrl();
  if (!url) throw new Error('Deploy as Web App first');
  var resp = UrlFetchApp.fetch(TELEGRAM_API() + '/setWebhook', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ url: url, drop_pending_updates: true })
  });
  return resp.getContentText();
}

function deleteWebhook() {
  var resp = UrlFetchApp.fetch(TELEGRAM_API() + '/deleteWebhook');
  return resp.getContentText();
}

function getMe() {
  return UrlFetchApp.fetch(TELEGRAM_API() + '/getMe').getContentText();
}
