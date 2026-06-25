const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const token = process.env.TELEGRAM_TOKEN;
if (!token) {
    console.error('Критическая ошибка: Переменная TELEGRAM_TOKEN не задана!');
    process.exit(1);
}

const SPACE_URL = 'https://gevorg22-gkara-save-bot.hf.space';
const WEBHOOK_PATH = `/webhook/${token}`;

const bot = new TelegramBot(token, { webHook: false });
console.log('Ожидаю webhook на:', `${SPACE_URL}${WEBHOOK_PATH}`);

const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === WEBHOOK_PATH) {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                bot.processUpdate(JSON.parse(body));
            } catch (e) {
                console.error('Ошибка парсинга update:', e.message);
            }
            res.writeHead(200);
            res.end('OK');
        });
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('gkara-save-bot is running');
    }
});

server.listen(7860, () => {
    console.log('Сервер запущен на порту 7860');
    console.log('Бот запущен и готов к работе...');
});

const INSTAGRAM_LINK = /instagram\.com/i;

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    if (text === '/start') {
        return bot.sendMessage(
            chatId,
            '👋 Привет! Я бот для скачивания медиа из Instagram.\n' +
            'Автор: Gevorg Karagozian\n\n' +
            'Что умею:\n' +
            '🎬 Reels и видео-посты\n' +
            '🖼 Фото и карусели\n\n' +
            'Просто отправь ссылку на публичный пост — пришлю файл!'
        );
    }

    if (!INSTAGRAM_LINK.test(text)) {
        return bot.sendMessage(
            chatId,
            '⚠️ Поддерживается только Instagram.\n\n' +
            'Примеры ссылок:\n' +
            '• https://www.instagram.com/reel/...\n' +
            '• https://www.instagram.com/p/...'
        );
    }

    const ts = Date.now();
    const outputTemplate = `/tmp/dl_${chatId}_${ts}.%(ext)s`;
    const videoFile = `/tmp/dl_${chatId}_${ts}.mp4`;
    const compressedFile = `/tmp/ready_${chatId}_${ts}.mp4`;

    await bot.sendMessage(chatId, '⏳ Ссылка принята. Скачиваю медиа, подождите...\n\n🤖 gkara-save-bot by Gevorg Karagozian');

    const ytDlpCmd = [
        'yt-dlp',
        '--no-playlist',
        '--no-warnings',
        '-o', `"${outputTemplate}"`,
        `"${text}"`,
    ].join(' ');

    exec(ytDlpCmd, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, async (err, stdout, stderr) => {
        if (err) {
            console.error('yt-dlp error:', stderr);
            await bot.sendMessage(chatId, '❌ Не удалось скачать. Убедись что пост публичный и ссылка верная.');
            return cleanup([videoFile, compressedFile]);
        }

        // Ищем скачанный файл (может быть .jpg, .mp4 и т.д.)
        const files = fs.readdirSync('/tmp').filter(f => f.startsWith(`dl_${chatId}_${ts}`));
        if (!files.length) {
            await bot.sendMessage(chatId, '❌ Файл не найден после скачивания.');
            return;
        }

        const downloadedFile = `/tmp/${files[0]}`;
        const ext = path.extname(downloadedFile).toLowerCase();

        // Фото — отправляем как фото
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
            try {
                await bot.sendPhoto(chatId, downloadedFile);
            } catch (e) {
                console.error('Ошибка отправки фото:', e.message);
                await bot.sendMessage(chatId, '❌ Ошибка отправки фото.');
            }
            return cleanup([downloadedFile]);
        }

        // Видео — перекодируем для совместимости с Telegram
        const fileSizeMb = fs.statSync(downloadedFile).size / (1024 * 1024);

        let ffmpegCmd;
        if (fileSizeMb > 49) {
            await bot.sendMessage(chatId, `🎬 Файл ${fileSizeMb.toFixed(1)} МБ — сжимаю для Telegram...`);
            const duration = await getVideoDuration(downloadedFile);
            const targetBitrate = duration > 0 ? Math.floor((45 * 8 * 1024) / duration) : 800;
            const videoBitrate = Math.max(200, targetBitrate - 128);
            ffmpegCmd = [
                'ffmpeg', `-i "${downloadedFile}"`,
                '-vcodec libx264 -preset faster',
                `-b:v ${videoBitrate}k -maxrate ${videoBitrate * 2}k -bufsize ${videoBitrate * 4}k`,
                '-acodec aac -b:a 128k',
                '-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"',
                '-movflags +faststart',
                `"${compressedFile}" -y`,
            ].join(' ');
        } else {
            ffmpegCmd = [
                'ffmpeg', `-i "${downloadedFile}"`,
                '-vcodec libx264 -preset faster -crf 23',
                '-acodec aac -b:a 128k',
                '-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"',
                '-movflags +faststart',
                `"${compressedFile}" -y`,
            ].join(' ');
        }

        exec(ffmpegCmd, { timeout: 300000 }, async (error) => {
            const fileToSend = (!error && fs.existsSync(compressedFile)) ? compressedFile : downloadedFile;
            await sendVideo(chatId, fileToSend);
            cleanup([downloadedFile, compressedFile]);
        });
    });
});

function getVideoDuration(filePath) {
    return new Promise((resolve) => {
        exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, (err, stdout) => {
            resolve(err ? 0 : Number.parseFloat(stdout.trim()) || 0);
        });
    });
}

async function sendVideo(chatId, filePath) {
    try {
        await bot.sendVideo(chatId, filePath, { supports_streaming: true });
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
            console.warn('cleanup failed:', f, e.message);
        }
    });
}
