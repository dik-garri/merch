function tgRequest(method, payload, isMultipart) {
  var url = TELEGRAM_API() + '/' + method;
  var options;
  if (isMultipart) {
    options = { method: 'post', payload: payload, muteHttpExceptions: true };
  } else {
    options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
  }
  var resp = UrlFetchApp.fetch(url, options);
  var text = resp.getContentText();
  var code = resp.getResponseCode();
  if (code >= 400) {
    logEvent('error', 'tg_' + method, text, { code: code, payload: payload });
  }
  try { return JSON.parse(text); } catch (e) { return { ok: false, raw: text }; }
}

function tgSendMessage(chatId, text, opts) {
  var p = { chat_id: chatId, text: text, parse_mode: 'HTML' };
  if (opts && opts.reply_markup) p.reply_markup = opts.reply_markup;
  if (opts && opts.disable_preview) p.disable_web_page_preview = true;
  return tgRequest('sendMessage', p);
}

function tgSendPhoto(chatId, photo, caption, opts) {
  if (typeof photo === 'string') {
    var p = { chat_id: chatId, photo: photo, parse_mode: 'HTML' };
    if (caption) p.caption = caption;
    if (opts && opts.reply_markup) p.reply_markup = opts.reply_markup;
    return tgRequest('sendPhoto', p);
  } else {
    var form = { chat_id: String(chatId), photo: photo, parse_mode: 'HTML' };
    if (caption) form.caption = caption;
    if (opts && opts.reply_markup) form.reply_markup = JSON.stringify(opts.reply_markup);
    return tgRequest('sendPhoto', form, true);
  }
}

function tgEditMessageText(chatId, messageId, text, opts) {
  var p = { chat_id: chatId, message_id: messageId, text: text, parse_mode: 'HTML' };
  if (opts && opts.reply_markup) p.reply_markup = opts.reply_markup;
  return tgRequest('editMessageText', p);
}

function tgDeleteMessage(chatId, messageId) {
  return tgRequest('deleteMessage', { chat_id: chatId, message_id: messageId });
}

function tgAnswerCallback(callbackId, text, alert) {
  var p = { callback_query_id: callbackId };
  if (text) p.text = text;
  if (alert) p.show_alert = true;
  return tgRequest('answerCallbackQuery', p);
}

function tgSendDocument(chatId, document, caption, opts) {
  var p = { chat_id: chatId, document: document, parse_mode: 'HTML' };
  if (caption) p.caption = caption;
  if (opts && opts.reply_markup) p.reply_markup = opts.reply_markup;
  return tgRequest('sendDocument', p);
}

function tgGetFile(fileId) {
  return tgRequest('getFile', { file_id: fileId });
}
