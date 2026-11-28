/**
 * @author xinz
 * @name 多模态
 * @team xinz
 * @description 通过可配置的 OCR/ASR/审核接口处理图片与音频链接
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^多模态$
 * @rule ^OCR\s+(\S+)$
 * @rule ^语音\s+(\S+)$
 * @rule ^审核\s+(\S+)$
 * @admin true
 * @public true
 * @priority 1000000
 * @disable false
 * @classification ["工具"]
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 */
'use strict';

const http = require('http');
const https = require('https');
const link = require('./mod/link');

const jsonSchema = BncrCreateSchema.object({
    ocrUrl: BncrCreateSchema.string().setTitle('OCR 接口').setDescription('接收 JSON {image}，返回 text 或 result').setDefault(''),
    ocrKey: BncrCreateSchema.string().setTitle('OCR Key').setDefault(''),
    asrUrl: BncrCreateSchema.string().setTitle('语音识别接口').setDescription('接收 JSON {audio}，返回 text').setDefault(''),
    asrKey: BncrCreateSchema.string().setTitle('语音识别 Key').setDefault(''),
    moderationUrl: BncrCreateSchema.string().setTitle('图片审核接口').setDescription('接收 JSON {image}，返回 flagged/labels').setDefault(''),
    moderationKey: BncrCreateSchema.string().setTitle('图片审核 Key').setDefault(''),
    timeout: BncrCreateSchema.number().setTitle('请求超时毫秒').setDefault(20000),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

link.register({
    name: '多模态',
    description: 'OCR/语音识别/图片审核',
    events: ['multimodal'],
    commands: ['OCR 图片URL', '语音 音频URL', '审核 图片URL'],
});

function postJson(url, body, key, timeout) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (e) {
            return reject(new Error('接口地址不合法'));
        }
        const lib = parsed.protocol === 'https:' ? https : http;
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
        if (key) headers.Authorization = 'Bearer ' + key;
        const req = lib.request(parsed, { method: 'POST', headers }, res => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', c => (data += c));
            res.on('end', () => {
                if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode + ' ' + data.slice(0, 100)));
                try {
                    resolve(JSON.parse(data || '{}'));
                } catch (e) {
                    reject(new Error('接口返回不是 JSON'));
                }
            });
        });
        req.setTimeout(Number(timeout) || 20000, () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}
function pickText(res) {
    if (!res) return '';
    if (typeof res.text === 'string') return res.text;
    if (typeof res.result === 'string') return res.result;
    if (res.data && typeof res.data.text === 'string') return res.data.text;
    if (res.data && typeof res.data.result === 'string') return res.data.result;
    if (res.choices && res.choices[0] && res.choices[0].message) return String(res.choices[0].message.content || '');
    return JSON.stringify(res).slice(0, 1000);
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    if (raw === '多模态') return s.reply('多模态用法：\nOCR https://.../image.jpg\n语音 https://.../audio.mp3\n审核 https://.../image.jpg\n\n需要在插件配置里填对应接口地址与 Key。');
    let m = raw.match(/^OCR\s+(\S+)$/);
    if (m) {
        if (!cfg.ocrUrl) return s.reply('未配置 OCR 接口');
        try {
            const res = await postJson(cfg.ocrUrl, { image: m[1], url: m[1] }, cfg.ocrKey, cfg.timeout);
            return s.reply('🔤 OCR 结果\n' + (pickText(res) || '（空）'));
        } catch (e) {
            return s.reply('OCR 失败：' + e.message);
        }
    }
    m = raw.match(/^语音\s+(\S+)$/);
    if (m) {
        if (!cfg.asrUrl) return s.reply('未配置语音识别接口');
        try {
            const res = await postJson(cfg.asrUrl, { audio: m[1], url: m[1] }, cfg.asrKey, cfg.timeout);
            return s.reply('🎙️ 语音识别\n' + (pickText(res) || '（空）'));
        } catch (e) {
            return s.reply('语音识别失败：' + e.message);
        }
    }
    m = raw.match(/^审核\s+(\S+)$/);
    if (m) {
        if (!cfg.moderationUrl) return s.reply('未配置图片审核接口');
        try {
            const res = await postJson(cfg.moderationUrl, { image: m[1], url: m[1] }, cfg.moderationKey, cfg.timeout);
            const flagged = res.flagged === true || res.result === 'block' || res.result === 'rejected';
            const labels = res.labels || (res.data && res.data.labels) || [];
            return s.reply(`🛡️ 图片审核\n结果：${flagged ? '需要复核' : '通过'}${labels.length ? '\n标签：' + labels.map(x => typeof x === 'string' ? x : x.name || x.label || '').filter(Boolean).join('、') : ''}`);
        } catch (e) {
            return s.reply('图片审核失败：' + e.message);
        }
    }
    return s.reply('多模态用法：\nOCR 图片URL\n语音 音频URL\n审核 图片URL');
};
