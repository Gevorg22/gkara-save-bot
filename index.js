const TelegramBot = require('node-telegram-bot-api');
const ytDlp = require('yt-dlp-exec');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const token = process.env.TELEGRAM_TOKEN;
if (!token) {
    console.error('Критическая ошибка: Переменная TELEGRAM_TOKEN не задана!');
    process.exit(1);
}

// Hugging Face Spaces требует HTTP-сервер на порту 7860, иначе Space считается "упавшим"
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('gkara-save-bot is running');
}).listen(7860, () => {
    console.log('Keep-alive сервер запущен на порту 7860');
});

const bot = new TelegramBot(token, { polling: true });
console.log('Бот запущен и готов к работе...');

const SUPPORTED_LINK = /(youtube\.com|youtu\.be|instagram\.com)/i;

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    if (text === '/start') {
        return bot.sendMessage(
            chatId,
            '🚀 Привет! Я бесплатный бот-загрузчик медиа.\n' +
            'Автор проекта: Gevorg Karagozian.\n\n' +
            'Отправь мне ссылку на видео из YouTube или Instagram — ' +
            'и я пришлю его файлом в течение пары минут!'
        );
    }

    if (!SUPPORTED_LINK.test(text)) {
        return bot.sendMessage(
            chatId,
            '⚠️ Поддерживаются только ссылки YouTube и Instagram.\n' +
            'Пример: https://youtu.be/dQw4w9WgXcQ'
        );
    }

    const rawFile = path.join('/tmp', `dl_${chatId}_${Date.now()}.mp4`);
    const compressedFile = path.join('/tmp', `ready_${chatId}_${Date.now()}.mp4`);

    await bot.sendMessage(chatId, '⏳ Ссылка принята. Скачиваю медиа, подождите...');

    try {
        await ytDlp(text, {
            output: rawFile,
            format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            mergeOutputFormat: 'mp4',
        });

        if (!fs.existsSync(rawFile)) {
            throw new Error('Файл не был создан yt-dlp.');
        }

        const fileSizeMb = fs.statSync(rawFile).size / (1024 * 1024);

        if (fileSizeMb > 49) {
            await bot.sendMessage(chatId, `🎬 Файл ${fileSizeMb.toFixed(1)} МБ — сжимаю для Telegram (лимит 50 МБ)...`);

            const ffmpegCmd = [
                'ffmpeg',
                `-i "${rawFile}"`,
                '-vcodec libx264 -crf 28 -preset faster',
                '-b:v 1M -maxrate 1.5M -bufsize 2M',
                '-acodec aac -b:a 128k',
                `-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"`,
                `"${compressedFile}" -y`,
            ].join(' ');

            exec(ffmpegCmd, async (error) => {
                if (error) {
                    console.error('ffmpeg error:', error.message);
                    await bot.sendMessage(chatId, '❌ Ошибка при сжатии видео.');
                    return cleanup([rawFile, compressedFile]);
                }
                await sendVideo(chatId, compressedFile);
                cleanup([rawFile, compressedFile]);
            });
        } else {
            await sendVideo(chatId, rawFile);
            cleanup([rawFile]);
        }
    } catch (err) {
        console.error('Ошибка загрузки:', err.message);
        await bot.sendMessage(
            chatId,
            '❌ Не удалось обработать ссылку.\n' +
            'Возможные причины: видео приватное, удалено или недоступно в вашем регионе.'
        );
        cleanup([rawFile, compressedFile]);
    }
});

async function sendVideo(chatId, filePath) {
    try {
        await bot.sendVideo(chatId, filePath, {
            supports_streaming: true,
        });
    } catch (err) {
        console.error('Ошибка отправки в TG:', err.message);
        await bot.sendMessage(chatId, '❌ Ошибка отправки файла. Попробуйте ещё раз.');
    }
}

function cleanup(files) {
    files.forEach((f) => {
        try {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch (e) {
            console.warn('Не удалось удалить файл:', f);
        }
    });
}
