/**
 * @author OpenClaw
 * @name 图片转文字
 * @team xinz
 * @origin 实用工具
 * @version 1.1.0
 * @description 图片 OCR 识别，支持百度 OCR，可在后台配置应用凭证
 * @platform tgBot qqBot wxKeAImao wxQianxun
 * @rule ^(识别图片 | OCR|图片转文字)$
 * @priority 100
 * @disable false
 * @admin false
 * @public false
 */

const fs = require('fs').promises;

const jsonSchema = BncrCreateSchema.object({
    appId: BncrCreateSchema.string().setTitle('百度 OCR AppID').setDefault(''),
    apiKey: BncrCreateSchema.string().setTitle('百度 OCR API Key').setDefault(''),
    secretKey: BncrCreateSchema.string().setTitle('百度 OCR Secret Key').setDefault(''),
    languageType: BncrCreateSchema.string().setTitle('识别语言').setDescription('CHN_ENG / ENG / JAP / KOR 等').setDefault('CHN_ENG'),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

let tokenCache = { token: '', expireAt: 0 };

async function getAccessToken(appId, apiKey, secretKey) {
    if (tokenCache.token && Date.now() < tokenCache.expireAt) return tokenCache.token;
    const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`;
    const resp = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10000) });
    const data = await resp.json();
    if (!data.access_token) throw new Error(data.error_description || '获取百度 OCR token 失败');
    tokenCache = { token: data.access_token, expireAt: Date.now() + (Number(data.expires_in) || 2592000) * 1000 - 60000 };
    return tokenCache.token;
}

async function loadImageBase64(source) {
    if (!source) throw new Error('未获取到图片地址');
    if (/^https?:\/\//i.test(source)) {
        const resp = await fetch(source, { signal: AbortSignal.timeout(15000) });
        if (!resp.ok) throw new Error(`下载图片失败: HTTP ${resp.status}`);
        const buf = Buffer.from(await resp.arrayBuffer());
        return buf.toString('base64');
    }
    const buf = await fs.readFile(source);
    return buf.toString('base64');
}

module.exports = async sender => {
    const msgType = sender.msgInfo?.type;
    if (msgType !== 'image') {
        await sender.reply('❌ 请先发送一张图片，再发送：识别图片');
        return;
    }

    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    if (!cfg.apiKey || !cfg.secretKey) {
        await sender.reply('⚠️ 尚未配置百度 OCR 凭证\n请在后台「插件配置编辑器」中填写 AppID、API Key、Secret Key 后再试');
        return;
    }

    const imageSource = sender.msgInfo?.path || sender.msgInfo?.url;
    if (!imageSource) {
        await sender.reply('❌ 无法获取图片数据，请稍后再试');
        return;
    }

    await sender.reply('🔄 正在识别图片中的文字，请稍候...');
    try {
        const imageBase64 = await loadImageBase64(Array.isArray(imageSource) ? imageSource[0] : imageSource);
        if (imageBase64.length > 4 * 1024 * 1024) {
            await sender.reply('❌ 图片超过 4MB，百度 OCR 无法处理，请压缩后再试');
            return;
        }

        const token = await getAccessToken(cfg.appId || '', cfg.apiKey, cfg.secretKey);
        const body = new URLSearchParams({
            image: imageBase64,
            language_type: cfg.languageType || 'CHN_ENG',
        });
        const resp = await fetch(`https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
            signal: AbortSignal.timeout(20000),
        });
        const data = await resp.json();
        if (data.error_code) throw new Error(`百度 OCR 错误 ${data.error_code}: ${data.error_msg || ''}`);

        const words = (data.words_result || []).map(item => item.words).filter(Boolean);
        if (words.length === 0) {
            await sender.reply('📸 未识别到文字，请换一张更清晰的图片');
            return;
        }
        await sender.reply(`📝 识别结果（共 ${words.length} 行）：\n\n${words.join('\n')}`);
    } catch (e) {
        console.error('[图片转文字] 识别失败:', e.message);
        await sender.reply(`❌ 识别失败：${e.message}`);
    }
};
