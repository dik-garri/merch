function handleMessage(msg) {
  var chatId = msg.chat.id;
  upsertUser(msg.from);

  if (msg.photo && msg.photo.length > 0) {
    var bestPhoto = msg.photo[msg.photo.length - 1];
    handleReceipt(chatId, bestPhoto.file_id, 'photo');
    return;
  }
  if (msg.document) {
    handleReceipt(chatId, msg.document.file_id, 'document');
    return;
  }

  var text = (msg.text || '').trim();

  // /cancel and /start always work, even mid-dialog
  if (text === '/start') return cmdStart(chatId);
  if (text === '/cancel') return cmdCancel(chatId);

  // FSM input takes priority over menu buttons — accidental menu click during
  // checkout shouldn't drop the dialog
  var state = getState(chatId);
  switch (state.name) {
    case STATES.COLLECTING_NAME:     return collectName(chatId, text);
    case STATES.COLLECTING_PHONE:    return collectPhone(chatId, text, msg);
    case STATES.COLLECTING_ADDRESS:  return collectAddress(chatId, text);
    case STATES.COLLECTING_COMMENT:  return collectComment(chatId, text);
    case STATES.ADMIN_REJECT_REASON: return collectAdminRejectReason(chatId, text);
  }

  if (text === '/help'  || text === 'ℹ️ Помощь') return cmdHelp(chatId);
  if (text === '📦 Каталог')    return cmdCatalog(chatId);
  if (text === '🛒 Корзина')    return cmdCart(chatId);
  if (text === '📋 Мои заказы') return cmdMyOrders(chatId);

  tgSendMessage(chatId, 'Не понял команду. Используйте кнопки меню или /start.', {
    reply_markup: kbMainMenu()
  });
}

function upsertUser(from) {
  if (!from) return;
  var sheet = getSheet('Users');
  var rowNum = findRowByColumn(sheet, 'chat_id', from.id);
  var data = {
    chat_id: from.id,
    username: from.username || '',
    first_name: from.first_name || '',
    last_seen: nowISO()
  };
  if (rowNum < 0) appendObject(sheet, data);
  else updateRow(sheet, rowNum, { username: data.username, first_name: data.first_name, last_seen: data.last_seen });
}

function cmdStart(chatId) {
  clearState(chatId);
  tgSendMessage(chatId,
    '👋 Добро пожаловать в магазин мерча!\n\nВыберите раздел:',
    { reply_markup: kbMainMenu() });
}

function cmdCancel(chatId) {
  clearState(chatId);
  tgSendMessage(chatId, 'Отменено. Главное меню:', { reply_markup: kbMainMenu() });
}

function cmdHelp(chatId) {
  tgSendMessage(chatId,
    'Команды:\n' +
    '/start — главное меню\n' +
    '/cancel — отменить текущее действие\n\n' +
    'По вопросам пишите администратору.',
    { reply_markup: kbMainMenu() });
}

function cmdCatalog(chatId) {
  var cats = listCategories();
  if (cats.length === 0) {
    tgSendMessage(chatId, 'Каталог пока пуст.');
    return;
  }
  tgSendMessage(chatId, '📦 Выберите категорию:', { reply_markup: kbCategories(cats) });
}

function cmdCart(chatId) {
  var items = cartItemsExpanded(chatId);
  if (items.length === 0) {
    tgSendMessage(chatId, '🛒 Корзина пуста. Нажмите 📦 Каталог чтобы добавить товары.');
    return;
  }
  tgSendMessage(chatId, formatCart(chatId), { reply_markup: kbCart() });
}

function cmdMyOrders(chatId) {
  var orders = listUserOrders(chatId);
  if (orders.length === 0) {
    tgSendMessage(chatId, 'У вас пока нет заказов.');
    return;
  }
  var lines = orders.slice(0, 10).map(function(o) {
    return escapeHtml(o.order_id) + ' — ' + escapeHtml(o.status) + ' — ' + formatMoney(o.total);
  });
  tgSendMessage(chatId, '<b>Ваши заказы:</b>\n' + lines.join('\n'));
}

function collectName(chatId, text) {
  if (!text || text.length < 2) return tgSendMessage(chatId, 'Введите имя (минимум 2 символа):');
  patchStateData(chatId, { name: text });
  setState(chatId, STATES.COLLECTING_PHONE, getState(chatId).data);
  tgSendMessage(chatId, '📱 Укажите телефон или нажмите кнопку:', { reply_markup: kbContactRequest() });
}

function collectPhone(chatId, text, msg) {
  var phone = (msg.contact && msg.contact.phone_number) ? msg.contact.phone_number : text;
  if (!phone || !/[\d+]/.test(phone)) return tgSendMessage(chatId, 'Укажите корректный номер телефона:');
  patchStateData(chatId, { phone: phone });
  setState(chatId, STATES.COLLECTING_ADDRESS, getState(chatId).data);
  // Restore main menu reply keyboard (was replaced by kbContactRequest)
  tgSendMessage(chatId, '🏠 Введите адрес доставки:', { reply_markup: kbMainMenu() });
}

function collectAddress(chatId, text) {
  if (!text || text.length < 5) return tgSendMessage(chatId, 'Введите полный адрес доставки:');
  patchStateData(chatId, { address: text });
  setState(chatId, STATES.COLLECTING_COMMENT, getState(chatId).data);
  tgSendMessage(chatId, '✏️ Комментарий к заказу (или отправьте «-» если без комментария):');
}

function collectComment(chatId, text) {
  var comment = (text === '-') ? '' : text;
  patchStateData(chatId, { comment: comment });
  var s = getState(chatId);
  s.name = STATES.CONFIRMING_ORDER;
  setState(chatId, s.name, s.data);
  showOrderConfirmation(chatId);
}

function showOrderConfirmation(chatId) {
  var d = getState(chatId).data;
  var items = cartItemsExpanded(chatId);
  var lines = items.map(function(it) {
    return '• ' + escapeHtml(it.title) + ' (' + it.size + ') × ' + it.qty + ' — ' + formatMoney(it.subtotal);
  });
  var total = items.reduce(function(s, it) { return s + it.subtotal; }, 0);
  var text = '<b>Проверьте заказ:</b>\n\n' +
             'Имя: ' + escapeHtml(d.name) + '\n' +
             'Телефон: ' + escapeHtml(d.phone) + '\n' +
             'Адрес: ' + escapeHtml(d.address) + '\n' +
             (d.comment ? 'Комментарий: ' + escapeHtml(d.comment) + '\n' : '') +
             '\n' + lines.join('\n') +
             '\n\n<b>Итого: ' + formatMoney(total) + '</b>';
  tgSendMessage(chatId, text, { reply_markup: kbOrderConfirm() });
}

function collectAdminRejectReason(chatId, text) {
  var data = getState(chatId).data;
  var orderId = data.order_id;
  clearState(chatId);
  if (!orderId) return;
  finalizeReject(orderId, text);
}

function handleCallback(cb) {
  var chatId = cb.message.chat.id;
  var data = cb.data || '';
  var parts = data.split(':');
  var ns = parts[0];

  try {
    switch (ns) {
      case 'cat':   return cbCategory(chatId, parts[1], cb);
      case 'prod':  return cbProduct(chatId, parts[1], cb);
      case 'size':  return cbSize(chatId, parts[1], parts[2], cb);
      case 'qty':   return cbQty(chatId, parts[1], cb);
      case 'cart':  return cbCart(chatId, parts[1], cb);
      case 'order': return cbOrder(chatId, parts[1], cb);
      case 'pay':   return cbPay(chatId, parts.slice(1), cb);
      case 'admin': return cbAdmin(chatId, parts.slice(1), cb);
      default: tgAnswerCallback(cb.id);
    }
  } catch (e) {
    logEvent('error', 'callback', String(e), { data: data });
    tgAnswerCallback(cb.id, 'Ошибка', true);
  }
}

function cbCategory(chatId, catId, cb) {
  if (catId === 'back') {
    tgAnswerCallback(cb.id);
    return cmdCatalog(chatId);
  }
  tgAnswerCallback(cb.id);
  var products = listProducts(catId);
  if (products.length === 0) {
    tgSendMessage(chatId, 'В этой категории пока нет товаров.');
    return;
  }
  products.forEach(function(p) { sendProductCard(chatId, p); });
}

function cbProduct(chatId, productId, cb) {
  tgAnswerCallback(cb.id);
  var p = getProduct(productId);
  if (!p) return tgSendMessage(chatId, 'Товар не найден');
  var sizes = productSizes(p);
  if (sizes.length === 0) {
    setState(chatId, STATES.CHOOSING_QTY, { product_id: productId, size: '-' });
    tgSendMessage(chatId, 'Сколько штук?', { reply_markup: kbQuantity() });
    return;
  }
  setState(chatId, STATES.CHOOSING_QTY, { product_id: productId });
  tgSendMessage(chatId, 'Выберите размер:', { reply_markup: kbSizes(productId, sizes) });
}

function cbSize(chatId, productId, size, cb) {
  tgAnswerCallback(cb.id);
  setState(chatId, STATES.CHOOSING_QTY, { product_id: productId, size: size });
  tgSendMessage(chatId, 'Сколько штук?', { reply_markup: kbQuantity() });
}

function cbQty(chatId, qtyStr, cb) {
  if (qtyStr === 'cancel') {
    clearState(chatId);
    tgAnswerCallback(cb.id, 'Отменено');
    return tgSendMessage(chatId, 'Главное меню:', { reply_markup: kbMainMenu() });
  }
  var state = getState(chatId);
  if (state.name !== STATES.CHOOSING_QTY || !state.data.product_id) {
    tgAnswerCallback(cb.id, 'Сначала выберите товар', true);
    return;
  }
  var qty = Number(qtyStr);
  addToCart(chatId, state.data.product_id, state.data.size || '-', qty);
  clearState(chatId);
  tgAnswerCallback(cb.id, 'Добавлено в корзину ✅');
  tgSendMessage(chatId, '✅ Добавлено. ' + formatCart(chatId), { reply_markup: kbCart() });
}

function cbCart(chatId, action, cb) {
  if (action === 'clear') {
    clearCart(chatId);
    tgAnswerCallback(cb.id, 'Корзина очищена');
    tgSendMessage(chatId, 'Корзина пуста.', { reply_markup: kbMainMenu() });
    return;
  }
  if (action === 'checkout') {
    tgAnswerCallback(cb.id);
    var items = cartItemsExpanded(chatId);
    if (items.length === 0) return tgSendMessage(chatId, 'Корзина пуста.');
    setState(chatId, STATES.COLLECTING_NAME, {});
    tgSendMessage(chatId, '👤 Введите ваше имя:');
  }
}

function cbOrder(chatId, action, cb) {
  if (action === 'cancel') {
    clearState(chatId);
    tgAnswerCallback(cb.id, 'Отменено');
    tgSendMessage(chatId, 'Заказ отменён. Корзина сохранена.', { reply_markup: kbMainMenu() });
    return;
  }
  if (action === 'confirm') {
    var d = getState(chatId).data;
    if (!d.name || !d.phone || !d.address) {
      tgAnswerCallback(cb.id, 'Не все данные собраны', true);
      return;
    }
    if (cartItemsExpanded(chatId).length === 0) {
      tgAnswerCallback(cb.id);
      clearState(chatId);
      tgSendMessage(chatId, 'Корзина пуста — заказ не создан.', { reply_markup: kbMainMenu() });
      return;
    }
    var result = createOrder(chatId, d);
    setState(chatId, STATES.AWAITING_PAYMENT, { order_id: result.order_id });
    tgAnswerCallback(cb.id, 'Заказ создан');
    notifyAdminOrderCreated(result.order_id);
    showPaymentInstructions(chatId, result.order_id);
  }
}

function cbPay(chatId, parts, cb) {
  // pay:done | pay:retry:<order_id>
  var action = parts[0];
  if (action === 'done') {
    var s = getState(chatId);
    if (s.name !== STATES.AWAITING_PAYMENT) {
      tgAnswerCallback(cb.id, 'Нет активной оплаты', true);
      return;
    }
    setState(chatId, STATES.AWAITING_RECEIPT, s.data);
    tgAnswerCallback(cb.id);
    tgSendMessage(chatId, '🧾 Пришлите фото/скриншот чека одним сообщением.');
    return;
  }
  if (action === 'retry') {
    var orderId = parts[1];
    var o = getOrder(orderId);
    if (!o || String(o.chat_id) !== String(chatId)) {
      tgAnswerCallback(cb.id, 'Заказ не найден', true);
      return;
    }
    updateOrderStatus(orderId, 'awaiting_payment', { reject_reason: '' });
    setState(chatId, STATES.AWAITING_PAYMENT, { order_id: orderId });
    tgAnswerCallback(cb.id);
    showPaymentInstructions(chatId, orderId);
  }
}

function cbAdmin(chatId, parts, cb) {
  var fromId = cb.from && cb.from.id;
  if (String(fromId) !== String(adminChatId())) {
    tgAnswerCallback(cb.id, 'Недоступно', true);
    return;
  }
  var action = parts[0];
  var orderId = parts[1];
  if (action === 'approve') return adminApprove(orderId, cb.id);
  if (action === 'reject')  return adminAskRejectReason(orderId, cb.id);
  if (action === 'reason')  return adminReject(orderId, parts[2], cb.id);
  tgAnswerCallback(cb.id);
}
