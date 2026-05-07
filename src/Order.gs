function createOrder(chatId, contact) {
  var items = cartItemsExpanded(chatId);
  if (items.length === 0) throw new Error('Cart is empty');
  var total = items.reduce(function(s, it) { return s + it.subtotal; }, 0);
  var ts = nowISO();

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  var orderId;
  try {
    var sheet = getSheet('Orders');
    orderId = 'ORD-' + String(sheet.getLastRow()).padStart(5, '0');
    appendObject(sheet, {
      order_id: orderId,
      chat_id: chatId,
      name: contact.name,
      phone: contact.phone,
      address: contact.address,
      comment: contact.comment || '',
      items_json: JSON.stringify(items),
      total: total,
      status: 'awaiting_payment',
      receipt_file_id: '',
      reject_reason: '',
      created_at: ts,
      updated_at: ts
    });
  } finally {
    lock.releaseLock();
  }
  clearCart(chatId);
  return { order_id: orderId, total: total, items: items };
}

function getOrder(orderId) {
  var rows = rowsAsObjects(getSheet('Orders'));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].order_id) === String(orderId)) return rows[i];
  }
  return null;
}

function updateOrderStatus(orderId, status, extra) {
  var sheet = getSheet('Orders');
  var rowNum = findRowByColumn(sheet, 'order_id', orderId);
  if (rowNum < 0) throw new Error('Order not found: ' + orderId);
  var patch = { status: status, updated_at: nowISO() };
  if (extra) Object.keys(extra).forEach(function(k) { patch[k] = extra[k]; });
  updateRow(sheet, rowNum, patch);
}

function listUserOrders(chatId) {
  return rowsAsObjects(getSheet('Orders'))
    .filter(function(o) { return String(o.chat_id) === String(chatId); })
    .sort(function(a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
}

function formatOrderSummary(orderId) {
  var o = getOrder(orderId);
  if (!o) return '(не найден)';
  var items = JSON.parse(o.items_json || '[]');
  var lines = items.map(function(it) {
    return '• ' + escapeHtml(it.title) + ' (' + it.size + ') × ' + it.qty + ' — ' + formatMoney(it.subtotal);
  });
  return '📦 <b>Заказ ' + escapeHtml(o.order_id) + '</b>\n' +
         'Статус: ' + escapeHtml(o.status) + '\n\n' +
         lines.join('\n') + '\n\n' +
         '<b>Итого: ' + formatMoney(o.total) + '</b>';
}
