---
title: gkara-save-bot
emoji: 🎬
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

# gkara-save-bot

Бесплатный Telegram-бот для скачивания медиа из Instagram.
Автор проекта: **Gevorg Karagozian**

---

## Возможности

- Reels и видео-посты
- Фото и карусели (публичные посты)
- Автоматическое сжатие видео через ffmpeg (лимит Telegram — 50 МБ)
- Автоочистка временных файлов после отправки
- Поддержка нескольких пользователей одновременно
- Безопасное хранение токена через переменные окружения

---

## Технологии

| Слой | Технология |
|---|---|
| Runtime | Node.js 20 |
| Telegram API | node-telegram-bot-api (webhook-режим) |
| Загрузка медиа | yt-dlp (последняя версия с GitHub) |
| Сжатие видео | ffmpeg + ffprobe |
| Контейнеризация | Docker |
| Хостинг | Railway |
| CI/CD | GitHub Actions (автодеплой при push) |

---

## Структура проекта

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

## Как это работает

1. Пользователь отправляет ссылку на Instagram
2. yt-dlp скачивает медиа (видео или фото)
3. Если видео > 49 МБ — ffmpeg сжимает его, рассчитывая битрейт по длительности
4. Все видео перекодируются в H.264 с флагом faststart для совместимости с Telegram
5. Бот отправляет файл пользователю
6. Временные файлы удаляются с сервера

```
Пользователь → Telegram → Webhook → Bot Server → yt-dlp → ffmpeg → Telegram → Пользователь
```

---

## Деплой

### Переменные окружения

| Переменная | Описание |
|---|---|
| `TELEGRAM_TOKEN` | Токен бота от @BotFather |

### Railway

1. Fork этого репозитория
2. Создай новый проект на [railway.app](https://railway.app) из GitHub
3. Добавь переменную `TELEGRAM_TOKEN` в Settings → Variables
4. Зарегистрируй webhook одним запросом в браузере:
   ```
   https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://{your-domain}/webhook/{TOKEN}
   ```

---

## Автор

**Gevorg Karagozian**
- GitHub: [github.com/Gevorg22](https://github.com/Gevorg22)

---

## Лицензия

MIT — используй свободно.
