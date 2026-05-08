function showPaymentInstructions(chatId, orderId) {
  var o = getOrder(orderId);
  if (!o) return;
  var text = '💳 <b>Оплата заказа ' + escapeHtml(orderId) + '</b>\n\n' +
             'Сумма: <b>' + formatMoney(o.total) + '</b>\n' +
             'MBank: <code>' + escapeHtml(MBANK_NUMBER()) + '</code>\n\n' +
             'После оплаты нажмите «Я оплатил» и пришлите скриншот чека.';
  var qrId = MBANK_QR_FILE_ID();
  if (qrId) {
    try {
      var blob = DriveApp.getFileById(qrId).getBlob();
      tgSendPhoto(chatId, blob, text, { reply_markup: kbPaymentDone() });
      return;
    } catch (e) {
      logEvent('warn', 'qr_load_failed', String(e));
    }
  }
  tgSendMessage(chatId, text, { reply_markup: kbPaymentDone() });
}

function handleReceipt(chatId, fileId, kind) {
  var state = getState(chatId);
  if (state.name !== STATES.AWAITING_RECEIPT) {
    tgSendMessage(chatId, 'Сейчас не ожидается чек. Используйте /start.');
    return;
  }
  var orderId = state.data.order_id;
  if (!orderId) {
    tgSendMessage(chatId, 'Не нашёл активный заказ. Используйте /start.');
    clearState(chatId);
    return;
  }
  updateOrderStatus(orderId, 'pending_review', { receipt_file_id: fileId, receipt_kind: kind });
  tgSendMessage(chatId,
    '✅ Чек получен. Мы проверим оплату и свяжемся с вами. Заказ <b>' + escapeHtml(orderId) + '</b>.',
    { reply_markup: kbMainMenu() });
  clearState(chatId);
  notifyAdminPendingReview(orderId, fileId, kind);
}
