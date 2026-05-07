# Merch Telegram Bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Telegram bot for a merch e-shop using Google Apps Script + Sheets + Drive, with browse → cart → checkout → MBank payment → admin manual confirmation flow.

**Architecture:** Single GAS project. `doPost` webhook routes Telegram updates to handlers. State machine per chat in ScriptProperties. Carts and orders persisted in Sheets. Product photos served from Drive. Admin gets inline buttons to approve/reject payment receipts.

**Tech Stack:** Google Apps Script (V8), Google Sheets, Google Drive, Telegram Bot API, `clasp` (optional, for local dev/push).

**Spec:** `docs/superpowers/specs/2026-05-07-merch-telegram-bot-design.md`

---

## File Structure

```
src/
├── Code.gs        # entry points: doPost, doGet
├── Config.gs      # Script Properties getters
├── Telegram.gs    # Bot API wrapper
├── Sheets.gs      # generic CRUD
├── State.gs       # FSM in ScriptProperties
├── Keyboards.gs   # inline + reply keyboards
├── Catalog.gs     # categories, products, photos
├── Cart.gs        # cart operations
├── Order.gs       # order creation, formatting, status
├── Payment.gs     # payment instructions + receipt capture
├── Admin.gs       # admin notifications + approve/reject
├── Handlers.gs    # message + callback routing
├── Setup.gs       # setupSheets, setWebhook, deleteWebhook
├── Utils.gs       # logging, helpers
└── appsscript.json
README.md
```

**Note on testing:** GAS doesn't have a real test runner. We write smoke-test functions in `Tests.gs` runnable from the GAS editor, and validate end-to-end via real Telegram messages on a dev bot. Each task ends with a manual smoke check.

---

## Task 1: Project scaffold

**Files:**
- Create: `src/appsscript.json`
- Create: `src/Config.gs`
- Create: `src/Utils.gs`
- Create: `README.md`

- [ ] **Step 1: Create `src/appsscript.json`**

```json
{
  "timeZone": "Asia/Bishkek",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "access": "ANYONE_ANONYMOUS",
    "executeAs": "USER_DEPLOYING"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/script.scriptapp"
  ]
}
```

- [ ] **Step 2: Create `src/Config.gs`**

```javascript
function cfg(key, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return v == null ? (fallback === undefined ? null : fallback) : v;
}

function BOT_TOKEN()       { return cfg('BOT_TOKEN'); }
function SHEET_ID()        { return cfg('SHEET_ID'); }
function ADMIN_CHAT_ID()   { return cfg('ADMIN_CHAT_ID'); }
function MBANK_NUMBER()    { return cfg('MBANK_NUMBER', ''); }
function MBANK_QR_FILE_ID(){ return cfg('MBANK_QR_FILE_ID', ''); }

var TELEGRAM_API = function() { return 'https://api.telegram.org/bot' + BOT_TOKEN(); };
```

- [ ] **Step 3: Create `src/Utils.gs`**

```javascript
function nowISO() {
  return Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
}

function formatMoney(n) {
  return Number(n).toLocaleString('ru-RU') + 'с';
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function logEvent(level, action, message, meta) {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_ID()).getSheetByName('Logs');
    if (!sheet) return;
    sheet.appendRow([new Date(), level, action, message || '', meta ? JSON.stringify(meta) : '']);
  } catch (e) { /* never fail request */ }
}

function uid() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}
```

- [ ] **Step 4: Create `README.md`**

```markdown
# merch — Telegram bot

Telegram-бот интернет-магазина мерча. Backend на Google Apps Script, БД — Google Sheets, фото — Google Drive.

## Setup

1. Создать бота через @BotFather, получить `BOT_TOKEN`.
2. Создать Google Sheet, скопировать `SHEET_ID` из URL.
3. Создать GAS-проект (script.google.com), привязать к Sheet (Extensions → Apps Script) или сделать standalone.
4. Скопировать содержимое `src/*.gs` и `src/appsscript.json` в проект.
5. Project Settings → Script Properties: задать `BOT_TOKEN`, `SHEET_ID`, `ADMIN_CHAT_ID`, `MBANK_NUMBER`, `MBANK_QR_FILE_ID` (опционально).
6. В редакторе запустить `setupSheets()` — создаст листы.
7. Deploy → New deployment → Web app → Anyone → Me. Скопировать URL.
8. Запустить `setWebhook()` с этим URL.
9. Заполнить `Categories` и `Products` вручную, ID файлов фото — из Drive.

## Структура

См. `docs/superpowers/specs/2026-05-07-merch-telegram-bot-design.md`.
```

- [ ] **Step 5: Commit**

```bash
git add src/appsscript.json src/Config.gs src/Utils.gs README.md
git commit -m "feat: project scaffold (config, utils, manifest)"
```

---

## Task 2: Sheets layer + setup

**Files:**
- Create: `src/Sheets.gs`
- Create: `src/Setup.gs`

- [ ] **Step 1: Create `src/Sheets.gs`**

```javascript
function getSheet(name) {
  var sheet = SpreadsheetApp.openById(SHEET_ID()).getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function getAllRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
}

function rowsAsObjects(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  return rows.map(function(r) {
    var o = {};
    headers.forEach(function(h, i) { o[h] = r[i]; });
    return o;
  });
}

function findRowByColumn(sheet, header, value) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = headers.indexOf(header);
  if (col < 0) throw new Error('Column not found: ' + header);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][col]) === String(value)) return i + 1;
  }
  return -1;
}

function updateRow(sheet, rowNumber, partial) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  headers.forEach(function(h, i) {
    if (Object.prototype.hasOwnProperty.call(partial, h)) row[i] = partial[h];
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

function appendObject(sheet, obj) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(h) { return obj[h] != null ? obj[h] : ''; });
  sheet.appendRow(row);
}
```

- [ ] **Step 2: Create `src/Setup.gs`**

```javascript
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
                        'items_json', 'total', 'status', 'receipt_file_id', 'created_at', 'updated_at']);
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
```

- [ ] **Step 3: Smoke check (manual, after deploy in later task)**

In GAS editor: run `setupSheets()` — should see all 6 sheets created with headers in the bound spreadsheet.

- [ ] **Step 4: Commit**

```bash
git add src/Sheets.gs src/Setup.gs
git commit -m "feat: sheets CRUD + setup functions"
```

---

## Task 3: Telegram API wrapper

**Files:**
- Create: `src/Telegram.gs`

- [ ] **Step 1: Create `src/Telegram.gs`**

```javascript
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
  // photo can be: file_id (string), URL (string), or Blob
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

function tgGetFile(fileId) {
  return tgRequest('getFile', { file_id: fileId });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Telegram.gs
git commit -m "feat: telegram api wrapper"
```

---

## Task 4: State machine

**Files:**
- Create: `src/State.gs`

- [ ] **Step 1: Create `src/State.gs`**

```javascript
// State machine. State is stored in ScriptProperties as JSON keyed by chat_id.
// Shape: { name: 'collecting_name', data: { ... } }

var STATES = {
  IDLE: 'idle',
  CHOOSING_QTY: 'choosing_qty',
  COLLECTING_NAME: 'collecting_name',
  COLLECTING_PHONE: 'collecting_phone',
  COLLECTING_ADDRESS: 'collecting_address',
  COLLECTING_COMMENT: 'collecting_comment',
  CONFIRMING_ORDER: 'confirming_order',
  AWAITING_PAYMENT: 'awaiting_payment',
  AWAITING_RECEIPT: 'awaiting_receipt',
  ADMIN_REJECT_REASON: 'admin_reject_reason'
};

function getState(chatId) {
  var raw = PropertiesService.getScriptProperties().getProperty('state_' + chatId);
  if (!raw) return { name: STATES.IDLE, data: {} };
  try { return JSON.parse(raw); } catch (e) { return { name: STATES.IDLE, data: {} }; }
}

function setState(chatId, name, data) {
  PropertiesService.getScriptProperties().setProperty(
    'state_' + chatId,
    JSON.stringify({ name: name, data: data || {} })
  );
}

function patchStateData(chatId, patch) {
  var s = getState(chatId);
  Object.keys(patch).forEach(function(k) { s.data[k] = patch[k]; });
  setState(chatId, s.name, s.data);
}

function clearState(chatId) {
  PropertiesService.getScriptProperties().deleteProperty('state_' + chatId);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/State.gs
git commit -m "feat: FSM state in script properties"
```

---

## Task 5: Keyboards

**Files:**
- Create: `src/Keyboards.gs`

- [ ] **Step 1: Create `src/Keyboards.gs`**

```javascript
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
  // categories: [{id, title}]
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
  // sizes: ['S', 'M', 'L', 'XL']
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
    [{ text: 'Чек не читается',  callback_data: 'admin:reason:' + orderId + ':unreadable' }],
    [{ text: 'Сумма не совпадает', callback_data: 'admin:reason:' + orderId + ':amount' }],
    [{ text: 'Платёж не найден', callback_data: 'admin:reason:' + orderId + ':notfound' }],
    [{ text: '✏️ Своя причина',   callback_data: 'admin:reason:' + orderId + ':custom' }]
  ]};
}

function kbContactRequest() {
  return {
    keyboard: [[{ text: '📱 Поделиться номером', request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Keyboards.gs
git commit -m "feat: inline + reply keyboards"
```

---

## Task 6: Catalog

**Files:**
- Create: `src/Catalog.gs`

- [ ] **Step 1: Create `src/Catalog.gs`**

```javascript
function listCategories() {
  var rows = rowsAsObjects(getSheet('Categories'));
  return rows.sort(function(a, b) { return Number(a.order || 0) - Number(b.order || 0); });
}

function listProducts(categoryId) {
  var rows = rowsAsObjects(getSheet('Products'));
  return rows.filter(function(p) {
    return String(p.category) === String(categoryId) && (p.active === true || String(p.active).toUpperCase() === 'TRUE');
  });
}

function getProduct(productId) {
  var rows = rowsAsObjects(getSheet('Products'));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(productId)) return rows[i];
  }
  return null;
}

function productSizes(product) {
  return String(product.sizes || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}

function productPhotoBlob(product) {
  if (!product.drive_file_id) return null;
  try {
    return DriveApp.getFileById(product.drive_file_id).getBlob();
  } catch (e) {
    logEvent('error', 'photo_load', String(e), { product_id: product.id });
    return null;
  }
}

function sendProductCard(chatId, product) {
  var caption = '<b>' + escapeHtml(product.title) + '</b>\n' +
                (product.description ? escapeHtml(product.description) + '\n' : '') +
                '💰 ' + formatMoney(product.price);
  var blob = productPhotoBlob(product);
  if (blob) {
    return tgSendPhoto(chatId, blob, caption, { reply_markup: kbProductCard(product.id) });
  }
  return tgSendMessage(chatId, caption, { reply_markup: kbProductCard(product.id) });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Catalog.gs
git commit -m "feat: catalog (categories, products, photo from Drive)"
```

---

## Task 7: Cart

**Files:**
- Create: `src/Cart.gs`

- [ ] **Step 1: Create `src/Cart.gs`**

```javascript
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
  // delete from bottom up
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
```

- [ ] **Step 2: Commit**

```bash
git add src/Cart.gs
git commit -m "feat: cart operations"
```

---

## Task 8: Order

**Files:**
- Create: `src/Order.gs`

- [ ] **Step 1: Create `src/Order.gs`**

```javascript
function generateOrderId() {
  var sheet = getSheet('Orders');
  var n = sheet.getLastRow(); // header + N rows; next is N
  return 'ORD-' + String(n).padStart(5, '0');
}

function createOrder(chatId, contact) {
  // contact: { name, phone, address, comment }
  var items = cartItemsExpanded(chatId);
  if (items.length === 0) throw new Error('Cart is empty');
  var total = items.reduce(function(s, it) { return s + it.subtotal; }, 0);
  var orderId = generateOrderId();
  var ts = nowISO();
  appendObject(getSheet('Orders'), {
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
    created_at: ts,
    updated_at: ts
  });
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
```

- [ ] **Step 2: Commit**

```bash
git add src/Order.gs
git commit -m "feat: order creation, status, formatting"
```

---

## Task 9: Payment

**Files:**
- Create: `src/Payment.gs`

- [ ] **Step 1: Create `src/Payment.gs`**

```javascript
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

function handleReceipt(chatId, photoFileId, messageId) {
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
  updateOrderStatus(orderId, 'pending_review', { receipt_file_id: photoFileId });
  tgSendMessage(chatId,
    '✅ Чек получен. Мы проверим оплату и свяжемся с вами. Заказ <b>' + escapeHtml(orderId) + '</b>.',
    { reply_markup: kbMainMenu() });
  clearState(chatId);
  notifyAdminPendingReview(orderId, photoFileId);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Payment.gs
git commit -m "feat: payment instructions + receipt capture"
```

---

## Task 10: Admin

**Files:**
- Create: `src/Admin.gs`

- [ ] **Step 1: Create `src/Admin.gs`**

```javascript
function adminChatId() { return ADMIN_CHAT_ID(); }

function notifyAdminOrderCreated(orderId) {
  var aid = adminChatId();
  if (!aid) return;
  tgSendMessage(aid, '📥 Заказ создан, ждём чека: <b>' + escapeHtml(orderId) + '</b>');
}

function notifyAdminPendingReview(orderId, receiptFileId) {
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
  tgSendPhoto(aid, receiptFileId, '🧾 Чек по заказу ' + escapeHtml(o.order_id), {
    reply_markup: kbAdminReview(o.order_id)
  });
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

function adminAskRejectReason(orderId, callbackId, adminMsgChatId, adminMsgId) {
  tgAnswerCallback(callbackId, 'Выберите причину');
  tgSendMessage(adminMsgChatId, 'Причина отклонения для ' + escapeHtml(orderId) + ':', {
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
  updateOrderStatus(orderId, 'rejected', { comment: reason });
  var o = getOrder(orderId);
  if (o) {
    tgSendMessage(o.chat_id,
      '❌ Оплата не подтверждена: ' + escapeHtml(reason) + '.\nИспользуйте /start чтобы попробовать снова.',
      { reply_markup: kbMainMenu() });
  }
  tgSendMessage(adminChatId(), 'Заказ ' + escapeHtml(orderId) + ' отклонён: ' + escapeHtml(reason));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Admin.gs
git commit -m "feat: admin notifications + approve/reject"
```

---

## Task 11: Message handler (text + photo)

**Files:**
- Create: `src/Handlers.gs` (first half)

- [ ] **Step 1: Create `src/Handlers.gs` with message routing**

```javascript
function handleMessage(msg) {
  var chatId = msg.chat.id;
  upsertUser(msg.from);

  // Photo handling — only meaningful in AWAITING_RECEIPT
  if (msg.photo && msg.photo.length > 0) {
    var bestPhoto = msg.photo[msg.photo.length - 1];
    handleReceipt(chatId, bestPhoto.file_id, msg.message_id);
    return;
  }

  var text = (msg.text || '').trim();

  // Commands
  if (text === '/start') return cmdStart(chatId);
  if (text === '/cancel') return cmdCancel(chatId);
  if (text === '/help'  || text === 'ℹ️ Помощь')   return cmdHelp(chatId);
  if (text === '📦 Каталог')      return cmdCatalog(chatId);
  if (text === '🛒 Корзина')      return cmdCart(chatId);
  if (text === '📋 Мои заказы')   return cmdMyOrders(chatId);

  // FSM-driven text input
  var state = getState(chatId);
  switch (state.name) {
    case STATES.COLLECTING_NAME:    return collectName(chatId, text);
    case STATES.COLLECTING_PHONE:   return collectPhone(chatId, text, msg);
    case STATES.COLLECTING_ADDRESS: return collectAddress(chatId, text);
    case STATES.COLLECTING_COMMENT: return collectComment(chatId, text);
    case STATES.ADMIN_REJECT_REASON: return collectAdminRejectReason(chatId, text);
    default:
      tgSendMessage(chatId, 'Не понял команду. Используйте кнопки меню или /start.', {
        reply_markup: kbMainMenu()
      });
  }
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

// FSM input collectors

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
  tgSendMessage(chatId, '🏠 Введите адрес доставки:', { reply_markup: { remove_keyboard: true } });
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
```

- [ ] **Step 2: Commit**

```bash
git add src/Handlers.gs
git commit -m "feat: message handler + checkout dialog"
```

---

## Task 12: Callback handler

**Files:**
- Modify: `src/Handlers.gs` (append callback handling)

- [ ] **Step 1: Append to `src/Handlers.gs`**

```javascript
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
      case 'pay':   return cbPay(chatId, parts[1], cb);
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
    // No sizes — go straight to qty
    setState(chatId, STATES.CHOOSING_QTY, { product_id: productId, size: '-' });
    tgSendMessage(chatId, 'Сколько штук?', { reply_markup: kbQuantity() });
    return;
  }
  setState(chatId, STATES.CHOOSING_QTY, { product_id: productId });
  tgSendMessage(chatId, 'Выберите размер:', { reply_markup: kbSizes(productId, sizes) });
}

function cbSize(chatId, productId, size, cb) {
  tgAnswerCallback(cb.id);
  patchStateData(chatId, { product_id: productId, size: size });
  tgSendMessage(chatId, 'Сколько штук?', { reply_markup: kbQuantity() });
}

function cbQty(chatId, qtyStr, cb) {
  if (qtyStr === 'cancel') {
    clearState(chatId);
    tgAnswerCallback(cb.id, 'Отменено');
    return tgSendMessage(chatId, 'Главное меню:', { reply_markup: kbMainMenu() });
  }
  var qty = Number(qtyStr);
  var d = getState(chatId).data;
  if (!d.product_id) { tgAnswerCallback(cb.id, 'Сначала выберите товар', true); return; }
  addToCart(chatId, d.product_id, d.size || '-', qty);
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
    var result = createOrder(chatId, d);
    setState(chatId, STATES.AWAITING_PAYMENT, { order_id: result.order_id });
    tgAnswerCallback(cb.id, 'Заказ создан');
    notifyAdminOrderCreated(result.order_id);
    showPaymentInstructions(chatId, result.order_id);
  }
}

function cbPay(chatId, action, cb) {
  if (action === 'done') {
    var s = getState(chatId);
    if (s.name !== STATES.AWAITING_PAYMENT) {
      tgAnswerCallback(cb.id, 'Нет активной оплаты', true);
      return;
    }
    setState(chatId, STATES.AWAITING_RECEIPT, s.data);
    tgAnswerCallback(cb.id);
    tgSendMessage(chatId, '🧾 Пришлите фото/скриншот чека одним сообщением.');
  }
}

function cbAdmin(chatId, parts, cb) {
  // parts: ['approve', orderId] | ['reject', orderId] | ['reason', orderId, code]
  if (String(chatId) !== String(adminChatId())) {
    tgAnswerCallback(cb.id, 'Недоступно', true);
    return;
  }
  var action = parts[0];
  var orderId = parts[1];
  if (action === 'approve') return adminApprove(orderId, cb.id);
  if (action === 'reject')  return adminAskRejectReason(orderId, cb.id, chatId, cb.message.message_id);
  if (action === 'reason')  return adminReject(orderId, parts[2], cb.id);
  tgAnswerCallback(cb.id);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Handlers.gs
git commit -m "feat: callback handler (catalog → cart → checkout → payment → admin)"
```

---

## Task 13: Entry points

**Files:**
- Create: `src/Code.gs`

- [ ] **Step 1: Create `src/Code.gs`**

```javascript
// Webhook entry — MUST NOT return ContentService output (causes pending updates).
function doPost(e) {
  try {
    var update = JSON.parse(e.postData.contents);
    if (update.message)         handleMessage(update.message);
    else if (update.callback_query) handleCallback(update.callback_query);
  } catch (err) {
    logEvent('error', 'doPost', String(err), { contents: e && e.postData && e.postData.contents });
  }
}

function doGet(e) {
  return ContentService.createTextOutput('Bot is running');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/Code.gs
git commit -m "feat: webhook entry points"
```

---

## Task 14: Deploy + smoke test

**Files:**
- Manual steps in GAS UI + Telegram.

- [ ] **Step 1: Create GAS project and paste files**

In script.google.com → New project → "merch-bot". Paste each `src/*.gs` file and `appsscript.json` (View → Show "appsscript.json" manifest file).

- [ ] **Step 2: Set Script Properties**

Project Settings → Script Properties → add:
- `BOT_TOKEN` = (from BotFather)
- `SHEET_ID` = (id of your spreadsheet)
- `ADMIN_CHAT_ID` = (your Telegram numeric chat id; get via @userinfobot)
- `MBANK_NUMBER` = (your MBank number)
- `MBANK_QR_FILE_ID` = (optional Drive file id)

- [ ] **Step 3: Run `setupSheets()`**

In editor: select `setupSheets` from function dropdown → Run. Authorize all scopes. Verify 6 sheets exist: Categories, Products, Carts, Orders, Users, Logs.

- [ ] **Step 4: Deploy as Web App**

Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone. Copy the `/exec` URL.

- [ ] **Step 5: Run `setWebhook()`**

Should print `{"ok":true,"result":true,"description":"Webhook was set"}`.

- [ ] **Step 6: Add seed data**

In `Categories` add: `tshirts | Футболки | 1`.
Upload a test photo to Drive, copy its file ID.
In `Products` add: `p001 | tshirts | Black Oversize | Тестовое описание | S,M,L,XL | 1500 | <file_id> | TRUE`.
**Important:** share the Drive photo with your Google account (the one running the script).

- [ ] **Step 7: Smoke test in Telegram**

1. Send `/start` → see main menu.
2. 📦 Каталог → see "Футболки".
3. Click "Футболки" → see product card with photo.
4. Click "Выбрать" → choose size → choose qty → "Добавлено".
5. 🛒 Корзина → see item, click "Оформить".
6. Enter name, phone, address, comment.
7. Confirm → see payment instructions.
8. Click "Я оплатил" → send any photo.
9. Receive "Чек получен".
10. As admin: receive order summary + receipt photo with Approve/Reject buttons.
11. Click "Подтвердить" → user receives confirmation.

If any step fails, check `Logs` sheet and Stackdriver logs in GAS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: deployment notes verified"
```

---

## Task 15: Robustness pass

**Files:**
- Modify: various `.gs` files based on issues found in smoke test.

- [ ] **Step 1: Verify error paths**

- Empty cart at checkout → must say "Корзина пуста".
- Invalid phone → must reprompt.
- Photo sent outside `AWAITING_RECEIPT` → must say "не ожидается чек".
- Non-admin clicks admin button → must say "Недоступно".

- [ ] **Step 2: Verify state isolation**

Two parallel test users should not see each other's state. Send `/start` from two accounts at once and walk through both flows.

- [ ] **Step 3: Verify Drive photo retry**

Delete a product's `drive_file_id`. Click product → bot should fall back to text card without crashing.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: robustness verified"
git push
```

---

## Done

After Task 15 passes, MVP is complete. Future work (admin commands, status notifications, group admin, etc.) lives in spec section 10.
