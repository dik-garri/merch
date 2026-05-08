# merch — Telegram-бот магазина мерча

Telegram-бот для интернет-магазина мерча. Backend — Google Apps Script, БД — Google Sheets, фото — Google Drive. Без серверов и хостинга.

**Стек:** Telegram Bot API · Google Apps Script (V8) · Google Sheets · Google Drive

## Возможности

- Каталог: категории → карточки товаров с фото из Drive
- Корзина: несколько позиций, очистка
- Оформление заказа: имя · телефон · адрес · комментарий
- Оплата через MBank: показ реквизитов / QR
- Подтверждение оплаты по чеку (фото или PDF)
- Ручная модерация админом: подтвердить / отклонить с причиной
- Повторная оплата после отклонения (без повторного оформления)
- Раздел «Мои заказы»
- Товары без размера (поле `sizes` = `-` или пусто) — шаг выбора размера пропускается

## Структура репозитория

```
merch/
├── src/                      # GAS-проект
│   ├── appsscript.json
│   ├── Code.gs               # webhook entry (doPost / doGet)
│   ├── Config.gs             # доступ к Script Properties
│   ├── Telegram.gs           # обёртка Telegram API
│   ├── Sheets.gs             # CRUD по Google Sheets
│   ├── State.gs              # FSM в ScriptProperties
│   ├── Keyboards.gs          # инлайн- и reply-клавиатуры
│   ├── Catalog.gs            # категории, товары, фото из Drive
│   ├── Cart.gs               # корзина
│   ├── Order.gs              # заказы (LockService для уникальности ID)
│   ├── Payment.gs            # инструкции по оплате + приём чека
│   ├── Admin.gs              # уведомления + approve/reject
│   ├── Handlers.gs           # роутинг message + callback
│   ├── Setup.gs              # setupSheets, setWebhook, deleteWebhook
│   └── Utils.gs              # logEvent, formatMoney, escapeHtml
├── seed/
│   ├── categories.csv        # пример категорий для импорта в Sheets
│   └── products.csv          # пример товаров (заглушки drive_file_id)
└── docs/superpowers/
    ├── specs/2026-05-07-merch-telegram-bot-design.md
    └── plans/2026-05-07-merch-telegram-bot.md
```

## Развёртывание

### 1. Telegram-бот

Создать через [@BotFather](https://t.me/BotFather): `/newbot` → получить `BOT_TOKEN`.
Узнать свой `chat_id` — написать [@userinfobot](https://t.me/userinfobot).

### 2. Google Sheet

Создать пустую таблицу. Скопировать `SHEET_ID` из URL: `https://docs.google.com/spreadsheets/d/`**`SHEET_ID`**`/edit`.

### 3. Google Drive

Создать папку для фото товаров, загрузить картинки. Для каждой — **Get link** → доступ **Anyone with the link (Viewer)**. ID файла — между `/d/` и `/view` в ссылке.

### 4. GAS-проект

[script.google.com](https://script.google.com) → **New project**. Скопировать содержимое всех `src/*.gs` и `src/appsscript.json` (включить отображение манифеста: ⚙️ → **Show "appsscript.json" manifest file**).

### 5. Script Properties

**Project Settings → Script Properties → Add script property:**

| Ключ | Значение |
|------|----------|
| `BOT_TOKEN` | токен от @BotFather |
| `SHEET_ID` | ID таблицы |
| `ADMIN_CHAT_ID` | ваш Telegram chat_id |
| `MBANK_NUMBER` | номер для перевода |
| `MBANK_QR_FILE_ID` | (опц.) Drive ID картинки QR |

### 6. Инициализация листов

В редакторе GAS выбрать функцию `setupSheets` → **Run**. Авторизовать все скоупы. В таблице появятся 6 листов: `Categories`, `Products`, `Carts`, `Orders`, `Users`, `Logs`.

### 7. Заполнение каталога

Импортировать `seed/categories.csv` и `seed/products.csv`:

- Открыть нужный лист → курсор на `A2`
- **File → Import → Upload** → CSV → **Replace data at selected cell** → **Separator: Comma**
- В `Products` заменить заглушки `..._REPLACE_ME` на реальные `drive_file_id`

### 8. Деплой Web App

**Deploy → New deployment → Type: Web app**
- Execute as: **Me**
- Who has access: **Anyone**

Скопировать URL вида `https://script.google.com/macros/s/.../exec`.

### 9. Установить webhook

В редакторе запустить функцию `setWebhook`. Должен вернуть `{"ok":true,"result":true,...}`.

Проверка: `getMe` вернёт инфо о боте.

## Обновление кода

После правок в `src/`:

1. **Deploy → Manage deployments → ✏️** на существующем deployment → **New version** → Deploy. URL не меняется, webhook переустанавливать не нужно.
2. Либо новый deployment → новый URL → запустить `setWebhook` заново.

Автоматизация через [`clasp`](https://github.com/google/clasp): `clasp push` пушит файлы из `src/`, `clasp deploy --deploymentId <id>` обновляет существующий deployment.

## Документация

- [Спека и архитектура](docs/superpowers/specs/2026-05-07-merch-telegram-bot-design.md)
- [Инструкция для модератора](docs/moderator-guide.md) — как добавлять товары и категории через Google Sheets

## Структура данных

См. подробности в [спеке](docs/superpowers/specs/2026-05-07-merch-telegram-bot-design.md).

**Статусы заказа:** `awaiting_payment` → `awaiting_receipt` → `pending_review` → `paid` / `rejected` → `shipped` → `done`.

**Где хранится что:**
- **Фото товаров** — Google Drive, ID в `Products.drive_file_id`.
- **Чеки оплаты** — только на серверах Telegram, в `Orders.receipt_file_id` лежит `file_id`. Тип файла — в `receipt_kind` (`photo` / `document`).
- **Корзины** — лист `Carts` (живёт между сессиями, очищается при оформлении заказа).
- **Состояния диалогов (FSM)** — `ScriptProperties` ключом `state_<chat_id>`.

## Smoke-тест

1. `/start` → главное меню
2. 📦 Каталог → категория → товар → размер → количество
3. 🛒 Корзина → Оформить → имя · телефон · адрес · комментарий → подтвердить
4. Реквизиты MBank → «Я оплатил» → отправить любое фото
5. Админу прилетает заказ + чек с кнопками **Подтвердить** / **Отклонить**
6. После Подтвердить → клиент получает уведомление, статус `paid`

При проблемах — лист `Logs` и **View → Executions** в GAS.

## Ограничения MVP

Не реализовано (см. секцию 10 спеки): админ-команды в боте, онлайн-оплата API, остатки, промокоды, отзывы, поиск/фильтры, мультиязычность, группа админов с топиками.
