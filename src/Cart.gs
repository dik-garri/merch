function getCart(chatId) {
  var rows = rowsAsObjects(getSheet('Carts'));
  return rows.filter(function(r) { return String(r.chat_id) === String(chatId); });
}

function addToCart(chatId, productId, size, qty) {
  appendObject(getSheet('Carts'), {
    chat_id: chatId,
    product_id: productId,
    size: size,
    qty: qty,
    added_at: nowISO()
  });
}

function clearCart(chatId) {
  var sheet = getSheet('Carts');
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(chatId)) sheet.deleteRow(i + 1);
  }
}

function cartItemsExpanded(chatId) {
  var lines = getCart(chatId);
  return lines.map(function(line) {
    var p = getProduct(line.product_id);
    return {
      product_id: line.product_id,
      title: p ? p.title : '(удалён)',
      price: p ? Number(p.price) : 0,
      size: line.size,
      qty: Number(line.qty),
      subtotal: (p ? Number(p.price) : 0) * Number(line.qty)
    };
  });
}

function cartTotal(chatId) {
  return cartItemsExpanded(chatId).reduce(function(sum, it) { return sum + it.subtotal; }, 0);
}

function formatCart(chatId) {
  var items = cartItemsExpanded(chatId);
  if (items.length === 0) return '🛒 Корзина пуста';
  var lines = items.map(function(it) {
    return '• ' + escapeHtml(it.title) + ' (' + it.size + ') × ' + it.qty + ' — ' + formatMoney(it.subtotal);
  });
  var total = items.reduce(function(s, it) { return s + it.subtotal; }, 0);
  return '🛒 <b>Корзина</b>\n\n' + lines.join('\n') + '\n\n<b>Итого: ' + formatMoney(total) + '</b>';
}
