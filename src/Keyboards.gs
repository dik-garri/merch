function kbMainMenu() {
  return {
    keyboard: [
      [{ text: '📦 Каталог' }, { text: '🛒 Корзина' }],
      [{ text: '📋 Мои заказы' }, { text: 'ℹ️ Помощь' }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

function kbCategories(categories) {
  var rows = categories.map(function(c) {
    return [{ text: c.title, callback_data: 'cat:' + c.id }];
  });
  return { inline_keyboard: rows };
}

function kbProductCard(productId) {
  return { inline_keyboard: [
    [{ text: '🛒 Выбрать', callback_data: 'prod:' + productId }]
  ]};
}

function kbSizes(productId, sizes) {
  var row = sizes.map(function(s) {
    return { text: s, callback_data: 'size:' + productId + ':' + s };
  });
  return { inline_keyboard: [row, [{ text: '← Назад', callback_data: 'cat:back' }]] };
}

function kbQuantity() {
  var row1 = [1, 2, 3, 4, 5].map(function(n) {
    return { text: String(n), callback_data: 'qty:' + n };
  });
  return { inline_keyboard: [row1, [{ text: '← Отмена', callback_data: 'qty:cancel' }]] };
}

function kbCart() {
  return { inline_keyboard: [
    [{ text: '✅ Оформить заказ', callback_data: 'cart:checkout' }],
    [{ text: '🗑 Очистить', callback_data: 'cart:clear' }]
  ]};
}

function kbOrderConfirm() {
  return { inline_keyboard: [
    [{ text: '✅ Подтвердить', callback_data: 'order:confirm' }],
    [{ text: '❌ Отменить', callback_data: 'order:cancel' }]
  ]};
}

function kbPaymentDone() {
  return { inline_keyboard: [
    [{ text: '💸 Я оплатил', callback_data: 'pay:done' }],
    [{ text: '❌ Отменить заказ', callback_data: 'order:cancel' }]
  ]};
}

function kbAdminReview(orderId) {
  return { inline_keyboard: [
    [
      { text: '✅ Подтвердить', callback_data: 'admin:approve:' + orderId },
      { text: '❌ Отклонить',  callback_data: 'admin:reject:'  + orderId }
    ]
  ]};
}

function kbAdminRejectReasons(orderId) {
  return { inline_keyboard: [
    [{ text: 'Чек не читается',    callback_data: 'admin:reason:' + orderId + ':unreadable' }],
    [{ text: 'Сумма не совпадает', callback_data: 'admin:reason:' + orderId + ':amount' }],
    [{ text: 'Платёж не найден',   callback_data: 'admin:reason:' + orderId + ':notfound' }],
    [{ text: '✏️ Своя причина',    callback_data: 'admin:reason:' + orderId + ':custom' }]
  ]};
}

function kbContactRequest() {
  return {
    keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}
