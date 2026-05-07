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
