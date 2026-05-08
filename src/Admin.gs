function adminChatId() { return ADMIN_CHAT_ID(); }

function notifyAdminOrderCreated(orderId) {
  var aid = adminChatId();
  if (!aid) return;
  tgSendMessage(aid, '📥 Заказ создан, ждём чека: <b>' + escapeHtml(orderId) + '</b>');
}

function notifyAdminPendingReview(orderId, receiptFileId, receiptKind) {
  var aid = adminChatId();
  if (!aid) return;
  var o = getOrder(orderId);
  if (!o) return;
  var items = JSON.parse(o.items_json || '[]');
  var lines = items.map(function(it) {
    return '• ' + escapeHtml(it.title) + ' (' + it.size + ') × ' + it.qty + ' — ' + formatMoney(it.subtotal);
  });
  var summary = '🆕 <b>Заказ ' + escapeHtml(o.order_id) + '</b>\n' +
                'Клиент: ' + escapeHtml(o.name) + '\n' +
                'Телефон: ' + escapeHtml(o.phone) + '\n' +
                'Адрес: ' + escapeHtml(o.address) + '\n' +
                (o.comment ? 'Комментарий: ' + escapeHtml(o.comment) + '\n' : '') +
                '\nПозиции:\n' + lines.join('\n') +
                '\n\n<b>Итого: ' + formatMoney(o.total) + '</b>';
  tgSendMessage(aid, summary);
  var caption = '🧾 Чек по заказу ' + escapeHtml(o.order_id);
  var opts = { reply_markup: kbAdminReview(o.order_id) };
  if (receiptKind === 'document') {
    tgSendDocument(aid, receiptFileId, caption, opts);
  } else {
    tgSendPhoto(aid, receiptFileId, caption, opts);
  }
}

function adminApprove(orderId, callbackId) {
  updateOrderStatus(orderId, 'paid');
  tgAnswerCallback(callbackId, 'Подтверждено');
  var o = getOrder(orderId);
  if (o) {
    tgSendMessage(o.chat_id,
      '🎉 Оплата подтверждена! Заказ <b>' + escapeHtml(orderId) + '</b> принят в работу.',
      { reply_markup: kbMainMenu() });
  }
}

function adminAskRejectReason(orderId, callbackId) {
  tgAnswerCallback(callbackId, 'Выберите причину');
  tgSendMessage(adminChatId(), 'Причина отклонения для ' + escapeHtml(orderId) + ':', {
    reply_markup: kbAdminRejectReasons(orderId)
  });
}

var REJECT_REASONS = {
  unreadable: 'Чек не читается',
  amount:     'Сумма не совпадает',
  notfound:   'Платёж не найден'
};

function adminReject(orderId, code, callbackId) {
  if (code === 'custom') {
    setState(adminChatId(), STATES.ADMIN_REJECT_REASON, { order_id: orderId });
    tgAnswerCallback(callbackId);
    tgSendMessage(adminChatId(), 'Введите свою причину одним сообщением:');
    return;
  }
  var reason = REJECT_REASONS[code] || 'Не указана';
  finalizeReject(orderId, reason);
  tgAnswerCallback(callbackId, 'Отклонено');
}

function finalizeReject(orderId, reason) {
  updateOrderStatus(orderId, 'rejected', { reject_reason: reason });
  var o = getOrder(orderId);
  if (o) {
    tgSendMessage(o.chat_id,
      '❌ Оплата не подтверждена: ' + escapeHtml(reason) + '.\n\nВы можете попробовать оплатить снова:',
      { reply_markup: kbRetryPayment(orderId) });
  }
  tgSendMessage(adminChatId(), 'Заказ ' + escapeHtml(orderId) + ' отклонён: ' + escapeHtml(reason));
}
