const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');

const token = process.env.TELEGRAM_TOKEN;
if (!token) {
    console.error('Критическая ошибка: Переменная TELEGRAM_TOKEN не задана!');
    process.exit(1);
}

// URL Space на Hugging Face: https://{owner}-{space-name}.hf.space
const SPACE_URL = 'https://gevorg22-gkara-save-bot.hf.space';
const WEBHOOK_PATH = `/webhook/${token}`;
const WEBHOOK_URL = `${SPACE_URL}${WEBHOOK_PATH}`;

const bot = new TelegramBot(token, { webHook: false });

// Webhook регистрируется вручную один раз через браузер:
// https://api.telegram.org/bot{TOKEN}/setWebhook?url={WEBHOOK_URL}
console.log('Ожидаю webhook на:', WEBHOOK_URL);

// HTTP-сервер принимает запросы от Telegram и отвечает на порту 7860
const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === WEBHOOK_PATH) {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const update = JSON.parse(body);
                bot.processUpdate(update);
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

    const ts = Date.now();
    const rawFile = `/tmp/dl_${chatId}_${ts}.mp4`;
    const compressedFile = `/tmp/ready_${chatId}_${ts}.mp4`;

    await bot.sendMessage(chatId, '⏳ Ссылка принята. Скачиваю медиа, подождите...\n\n🤖 gkara-save-bot by Gevorg Karagozian');

    const ytDlpCmd = [
        'yt-dlp',
        '-f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]/best"',
        '--merge-output-format mp4',
        '--no-playlist',
        '--no-warnings',
        '-o', `"${rawFile}"`,
        `"${text}"`,
    ].join(' ');

    exec(ytDlpCmd, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, async (err, stdout, stderr) => {
        if (err || !fs.existsSync(rawFile)) {
            console.error('yt-dlp error:', err?.message, stderr);
            await bot.sendMessage(
                chatId,
                `❌ Ошибка yt-dlp:\n<pre>${(stderr || err?.message || 'unknown').slice(0, 3000)}</pre>`,
                { parse_mode: 'HTML' }
            );
            return cleanup([rawFile, compressedFile]);
        }

        const fileSizeMb = fs.statSync(rawFile).size / (1024 * 1024);

        if (fileSizeMb > 49) {
            await bot.sendMessage(chatId, `🎬 Файл ${fileSizeMb.toFixed(1)} МБ — сжимаю для Telegram...`);

            // Считаем битрейт чтобы уложиться в 45 МБ (с запасом)
            const duration = await getVideoDuration(rawFile);
            const targetBitrate = duration > 0
                ? Math.floor((45 * 8 * 1024) / duration)
                : 800;
            const videoBitrate = Math.max(200, targetBitrate - 128);

            const ffmpegCmd = [
                'ffmpeg',
                `-i "${rawFile}"`,
                '-vcodec libx264 -preset faster',
                `-b:v ${videoBitrate}k -maxrate ${videoBitrate * 2}k -bufsize ${videoBitrate * 4}k`,
                '-acodec aac -b:a 128k',
                '-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"',
                '-movflags +faststart',
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
            // Перекодируем через libx264 — гарантирует совместимость с Telegram
            const repackCmd = [
                'ffmpeg',
                `-i "${rawFile}"`,
                '-vcodec libx264 -preset faster -crf 23',
                '-acodec aac -b:a 128k',
                '-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"',
                '-movflags +faststart',
                `"${compressedFile}" -y`,
            ].join(' ');
            exec(repackCmd, { timeout: 300000 }, async (error) => {
                if (error || !fs.existsSync(compressedFile)) {
                    console.error('repack error:', error?.message);
                    await sendVideo(chatId, rawFile);
                    return cleanup([rawFile, compressedFile]);
                }
                await sendVideo(chatId, compressedFile);
                cleanup([rawFile, compressedFile]);
            });
        }
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
