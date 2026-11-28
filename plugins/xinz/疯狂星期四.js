/**
 *  @author seven
 *  @name 疯狂星期四
 *  @team xinz
 *  @description 疯狂星期四文案，每日 10:03 定时检查，仅周四推送
 *  @rule ^(疯狂星期四)$
 *  @admin false
 *  @public false
 *  @priority 99999
 *  @disable false
 *  @cron 16 3 10 * * *
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @updated 2026-11-28
 * @classification ["工具"]
 */
const axios = require('axios');

const FALLBACK_TEXT = '今天是疯狂星期四，V我50，我要去啃德基。';
const jsonSchema = BncrCreateSchema.object({
    targets: BncrCreateSchema.string()
        .setTitle('推送目标')
        .setDescription('每行一个，格式为「平台:群ID」，例如 qq:834396229')
        .setDefault('qq:834396229\nqq:671685583\nqq:420035660\ntgbot:960566450\nHumanTG:671685583'),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

function parseTargets(raw) {
    return String(raw || '')
        .split(/\n|,/)
        .map(line => {
            const i = line.indexOf(':');
            if (i < 0) return null;
            const platform = line.slice(0, i).trim();
            const groupId = line.slice(i + 1).trim();
            return platform && groupId ? { platform, groupId } : null;
        })
        .filter(Boolean);
}

async function fetchKfcText() {
    const urls = [
        'https://kfc-crazy-thursday.vercel.app/api/index',
        'https://api.kfc-crazy-thursday.com/v1/random',
    ];
    for (const url of urls) {
        try {
            const res = await axios.get(url, {
                timeout: 10000,
                responseType: 'text',
                transformResponse: [d => d],
                validateStatus: s => s === 200,
            });
            const body = String(res.data || '').trim();
            if (!body) continue;
            // 接口有时返回 JSON 包裹，取里面的字符串
            try {
                const j = JSON.parse(body);
                if (typeof j === 'string') return j;
                if (j && typeof j.text === 'string') return j.text;
                if (j && typeof j.data === 'string') return j.data;
            } catch (e) {}
            if (body.length < 3000 && !body.startsWith('<!DOCTYPE') && !body.startsWith('<html')) return body;
        } catch (e) {
            console.warn('[疯狂星期四] 接口失败 ' + url + ': ' + e.message);
        }
    }
    return FALLBACK_TEXT;
}

module.exports = async s => {
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const rawTargets = cfg.targets || 'qq:834396229\nqq:671685583\nqq:420035660\ntgbot:960566450\nHumanTG:671685583';

    // 星期几本地计算，不再依赖第三方节假日接口（原 mxnzp 接口已失效，会导致 weekDay 为 undefined）
    const weekday = new Date().getDay(); // 0 周日 … 4 周四
    const isCron = s.getFrom() === 'cron';

    if (isCron && weekday !== 4) return; // 非周四的定时触发直接静默退出

    const text = await fetchKfcText();

    if (isCron) {
        const list = parseTargets(rawTargets);
        for (const t of list) {
            try {
                await sysMethod.push({ platform: t.platform, groupId: t.groupId, userId: [], msg: text });
            } catch (e) {
                console.warn(`[疯狂星期四] 推送 ${t.platform}:${t.groupId} 失败: ${e.message}`);
            }
        }
        return;
    }

    try {
        s.delMsg(s.getMsgId(), { wait: 1 });
    } catch (e) {}
    await s.reply(text);
};
