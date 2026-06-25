---
title: gkara-save-bot
emoji: 🎬
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

# 🎬 gkara-save-bot

> Бесплатный Telegram-бот для скачивания видео и фото из YouTube и Instagram.
> Автор проекта: **Gevorg Karagozian**

---

## ✨ Возможности

- 📥 Скачивание видео с **YouTube** (включая Shorts)
- 📸 Скачивание видео и фото с **Instagram** (публичные посты и Reels)
- 🗜️ Автоматическое сжатие тяжёлых файлов через **ffmpeg** (лимит Telegram — 50 МБ)
- 🧹 Автоочистка временных файлов с сервера после отправки
- ⚡ Поддержка нескольких пользователей одновременно
- 🔐 Безопасное хранение токена через переменные окружения

---

## 🛠️ Технологии

| Слой | Технология |
|---|---|
| Runtime | Node.js 20 |
| Telegram API | node-telegram-bot-api (webhook-режим) |
| Загрузка медиа | yt-dlp (установлен через pip) |
| Сжатие видео | ffmpeg + ffprobe |
| Контейнеризация | Docker |
| Хостинг | Railway / Hugging Face Spaces |
| CI/CD | GitHub Actions (автодеплой при push) |

---

## 📂 Структура проекта

```
gkara-save-bot/
├── index.js          # Основная логика бота
├── package.json      # Зависимости Node.js
├── Dockerfile        # Сборка Docker-образа
├── README.md         # Документация
└── .github/
    └── workflows/
        └── deploy.yml  # Автодеплой на Hugging Face
```

---

## ⚙️ Как это работает

1. Пользователь отправляет ссылку на YouTube или Instagram
2. `yt-dlp` скачивает медиа в формате MP4 (максимум 720p)
3. Если файл > 49 МБ — `ffmpeg` сжимает его, рассчитывая битрейт по длительности
4. Бот отправляет готовый файл пользователю
5. Временные файлы удаляются с сервера

```
Пользователь → Telegram → Webhook → Bot Server → yt-dlp → ffmpeg → Telegram → Пользователь
```

---

## 🚀 Деплой

### Переменные окружения

| Переменная | Описание |
|---|---|
| `TELEGRAM_TOKEN` | Токен бота от @BotFather |

### Railway (рекомендуется)

1. Fork этого репозитория
2. Создай новый проект на [railway.app](https://railway.app) из GitHub
3. Добавь переменную `TELEGRAM_TOKEN` в Settings → Variables
4. Зарегистрируй webhook:
   ```
   https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://{your-domain}/webhook/{TOKEN}
   ```

### Hugging Face Spaces

Проект поддерживает деплой на Hugging Face Spaces через Docker.
GitHub Actions автоматически деплоит при каждом `push` в `main`.

---

## 👤 Автор

**Gevorg Karagozian**
- Telegram-бот: [@gkara_save_bot](https://t.me/gkara_save_bot)
- GitHub: [github.com/Gevorg22](https://github.com/Gevorg22)

---

## 📄 Лицензия

MIT — используй свободно.
