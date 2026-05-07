# Telegram-бот merch-магазина — дизайн

**Дата:** 2026-05-07
**Стек:** Telegram Bot API + Google Apps Script + Google Sheets + Google Drive

## 1. Цель

MVP интернет-магазина мерча в Telegram без backend-сервера. Пользователь выбирает товары из каталога, оформляет заказ, оплачивает через MBank и присылает скриншот чека. Админ подтверждает оплату вручную.

## 2. Архитектура

```
Пользователь ──Telegram──▶ Webhook (doPost) ──▶ Google Apps Script
                                                      │
                              ┌───────────────────────┼───────────────────┐
                              ▼                       ▼                   ▼
                        Google Sheets          Google Drive       Telegram Bot API
                       (5 листов: Products,   (фото товаров,      (ответы клиенту,
                        Categories, Carts,     QR-код MBank)       уведомления админу)
                        Orders, Users, Logs)
```

- **Webhook-бот:** `doPost` принимает апдейты Telegram, роутит в `handleMessage` / `handleCallback`. `doPost` ничего не возвращает (иначе Telegram копит pending updates).
- **FSM:** состояния диалогов хранятся в `ScriptProperties` ключом `state_<chatId>`.
- **Корзина:** хранится в листе `Carts` (переживает рестарты).
- **Фото товаров:** в `Products.drive_file_id` хранится ID файла Google Drive; бот читает blob через `DriveApp.getFileById(id).getBlob()` и шлёт через `sendPhoto`.

## 3. Ключевые решения

| # | Вопрос | Решение |
|---|--------|---------|
| 1 | Хранение фото | Google Drive (file ID в Sheets) |
| 2 | Корзина | Несколько позиций, без редактирования количества (только «очистить» / «оформить») |
| 3 | Подтверждение оплаты | Скриншот чека → ручное подтверждение админом |
| 4 | Уведомления | Один админ (`ADMIN_CHAT_ID` в Script Properties) |
| 5 | UI каталога | Карточка на товар (фото + кнопка «Выбрать») |

## 4. Структура Google Sheets

### `Products`
| id | category | title | description | sizes | price | drive_file_id | active |
|----|----------|-------|-------------|-------|-------|---------------|--------|
| `p001` | `tshirts` | Black Oversize | … | `S,M,L,XL` | 1500 | `1aBc...` | `TRUE` |

- `sizes` — CSV
- `active=FALSE` скрывает товар, не удаляя

### `Categories`
| id | title | order |
|----|-------|-------|

### `Carts`
| chat_id | product_id | size | qty | added_at |

При оформлении строки клиента переносятся в `Orders.items_json` и удаляются.

### `Orders`
| order_id | chat_id | name | phone | address | comment | items_json | total | status | receipt_file_id | created_at | updated_at |

**Статусы:** `awaiting_payment` → `awaiting_receipt` → `pending_review` → `paid` / `rejected` → `shipped` → `done`.

`items_json` — массив `[{product_id, title, size, qty, price}]` (snapshot цены на момент заказа).

### `Users`
| chat_id | username | first_name | last_seen |

### `Logs`
| ts | level | action | message | meta_json |

## 5. Пользовательский диалог (FSM)

```
idle ──/start──▶ idle (главное меню: Каталог / Корзина / Мои заказы / Помощь)
  │
  ├──[Каталог]──▶ browsing_categories ──▶ browsing_products ──▶ choosing_size ──▶ choosing_qty ──▶ idle (товар добавлен в Carts)
  │
  ├──[Корзина]──▶ viewing_cart ──[Оформить]──▶ collecting_name ──▶ collecting_phone ──▶ collecting_address ──▶ collecting_comment ──▶ confirming_order
  │
  └──[confirming_order: «Подтвердить»]──▶ awaiting_payment (показ MBank/QR)
                                                │
                                                ├──[«Я оплатил»]──▶ awaiting_receipt (ждём фото)
                                                │                          │
                                                │                          └──[фото получено]──▶ pending_review ──▶ уведомление админу
                                                │                                                                          │
                                                │                                                  ┌───────────────────────┤
                                                │                                                  ▼ (callback от админа)  ▼
                                                │                                              «Подтвердить»            «Отклонить»
                                                │                                                  │                        │
                                                │                                                  ▼                        ▼
                                                │                                              status=paid             status=rejected
                                                │                                                  │                        │
                                                │                                                  └─клиент уведомлён──────┘
                                                │
                                                └──[«Отменить»]──▶ idle
```

- `/cancel` сбрасывает FSM в `idle` (корзину не трогает).
- Главное меню — ReplyKeyboard внизу: `📦 Каталог · 🛒 Корзина · 📋 Мои заказы · ℹ️ Помощь`.
- Корзина показывает позиции одним сообщением + кнопки: `Оформить заказ`, `Очистить корзину`, `← Назад`.

## 6. Уведомления админу

При `status = pending_review`:

```
🆕 Заказ #ORD-00042
Клиент: Иван Петров (@ivan)
Телефон: +996 555 123456
Адрес: Бишкек, ул. Чуй 100, кв. 5
Комментарий: позвоните перед доставкой

Позиции:
• Black Oversize (M) × 2 — 3000с
• White Minimal (L) × 1 — 1200с

Итого: 4200с
```

Затем — отдельное сообщение со скриншотом чека и инлайн-кнопками:

`✅ Подтвердить оплату` · `❌ Отклонить`

**Подтвердить:** `Orders.status = paid`, клиенту: «Оплата подтверждена, заказ #ORD-00042 принят в работу 🎉».

**Отклонить:** второй ряд кнопок — типовые причины (`Чек не читается` / `Сумма не совпадает` / `Платёж не найден`) или `Своя причина` (бот просит ввести текст). Клиенту: «Оплата не подтверждена: <причина>. /start чтобы попробовать снова».

Дополнительно: `📥 Заказ создан, ждём чека ORD-00042` — простое сообщение без кнопок (видеть зависшие заказы).

## 7. Структура кода

```
src/
├── Code.gs        # doPost, doGet, роутинг
├── Config.gs      # константы и getter-ы Script Properties
├── Telegram.gs    # sendMessage, sendPhoto, editMessage, deleteMessage, answerCallback
├── Sheets.gs      # getSheet, findRow, append, update — низкоуровневый CRUD
├── Catalog.gs     # listCategories, listProducts, getProduct, getProductPhoto (Drive)
├── Cart.gs        # addToCart, getCart, clearCart, formatCart, calcTotal
├── Order.gs       # createOrder, updateStatus, formatOrder, generateOrderId, listUserOrders
├── Payment.gs     # showPaymentInstructions, handleReceipt
├── Admin.gs       # notifyAdmin, handleAdminCallback (approve/reject + причины)
├── State.gs       # getState, setState, clearState (FSM)
├── Keyboards.gs   # все инлайн- и reply-клавиатуры
├── Handlers.gs    # handleMessage, handleCallback, handleCommand — высокоуровневый роутинг
├── Setup.gs       # setupSheets, setWebhook, deleteWebhook
└── Utils.gs       # logEvent, formatMoney, nowISO, escapeHtml
```

**Принципы:**
- `Code.gs` — только entry points.
- `Telegram.gs` и `Sheets.gs` — единственные модули с внешними вызовами.
- `Admin.gs` отделён, чтобы будущая миграция на группу/топики затронула только его.

**Callback data (короткие, чтобы влезать в 64 байта):**
- `cat:<id>` — выбор категории
- `prod:<id>` — выбор товара
- `size:<prod_id>:<S>` — выбор размера
- `qty:<n>` — выбор количества
- `cart:clear` / `cart:checkout`
- `order:confirm` / `order:cancel`
- `pay:done` — клиент нажал «Я оплатил»
- `admin:approve:<order_id>` / `admin:reject:<order_id>` / `admin:reason:<order_id>:<code>`

## 8. Конфигурация (Script Properties)

| Ключ | Назначение |
|------|------------|
| `BOT_TOKEN` | Токен от @BotFather |
| `SHEET_ID` | ID Google-таблицы |
| `ADMIN_CHAT_ID` | Telegram chat_id админа |
| `MBANK_NUMBER` | Номер карты/телефона для оплаты |
| `MBANK_QR_FILE_ID` | (опц.) Drive ID картинки QR |

## 9. Что НЕ входит в MVP

- Админка через бот (товары/цены редактируются вручную в Sheets)
- Онлайн-оплата через API
- Складской учёт, остатки
- Промокоды, отзывы, личный кабинет
- Аналитика, CRM
- Поиск, фильтры, избранное
- Несколько админов / группа / топики
- Мультиязычность

## 10. Будущие улучшения

- Админ-команды в боте (`/add_product`, `/set_price`)
- Уведомления о смене статуса (отправлен / доставлен)
- Карусель товаров (редактирование одного сообщения)
- Группа админов с топиками по статусам
- Интеграция MBank API (если появится публичная)
