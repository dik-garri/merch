function cfg(key, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return v == null ? (fallback === undefined ? null : fallback) : v;
}

function BOT_TOKEN()        { return cfg('BOT_TOKEN'); }
function SHEET_ID()         { return cfg('SHEET_ID'); }
function ADMIN_CHAT_ID()    { return cfg('ADMIN_CHAT_ID'); }
function MBANK_NUMBER()     { return cfg('MBANK_NUMBER', ''); }
function MBANK_QR_FILE_ID() { return cfg('MBANK_QR_FILE_ID', ''); }

var TELEGRAM_API = function() { return 'https://api.telegram.org/bot' + BOT_TOKEN(); };
