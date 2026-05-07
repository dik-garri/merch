// Webhook entry — MUST NOT return ContentService output (causes pending updates).
function doPost(e) {
  try {
    var update = JSON.parse(e.postData.contents);
    if (update.message)             handleMessage(update.message);
    else if (update.callback_query) handleCallback(update.callback_query);
  } catch (err) {
    logEvent('error', 'doPost', String(err), { contents: e && e.postData && e.postData.contents });
  }
}

function doGet(e) {
  return ContentService.createTextOutput('Bot is running');
}
