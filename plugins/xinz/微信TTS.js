/**
 * @author xinz
 * @name 微信TTS
 * @team xinz
 * @description 文字转语音开关与多平台配置，配合 wxClawBot 适配器使用（默认关闭）
 * @rule ^(tts|TTS)$
 * @rule ^(tts|TTS)\s+(开|关|状态|列表)$
 * @rule ^(tts|TTS)\s+(平台|切换)\s+([^ \n]+)$
 * @rule ^(tts|TTS)\s+(设置|添加)\s+([^ \n]+)\s+([^ \n]+)\s+([^ \n]+)(?:\s+([^ \n]+))?
 * @rule ^(语音|朗读)\s+([^\n]+)$
 * @admin false
 * @public false
 * @priority 5
 * @disable false
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @updated 2026-11-28
 * @classification ["工具"]
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const DB = new BncrDB('wxTTS');
const WXDB = new BncrDB('wxClawBot');

const DEF_PLATFORM = {
    name: 'ttson',
    api: 'ttson',
    url: 'https://api.ttson.cn',
    key: '', // Token 请用「tts 设置」或在面板填写，勿提交到仓库
    voice: 3585,
    speed: 1,
};

async function getCfg() {
    const c = (await DB.get('config', null)) || {};
    const platforms = c.platforms && c.platforms.length ? c.platforms : [DEF_PLATFORM];
    return {
        enabled: !!c.enabled,
        active: c.active || platforms[0].name,
        platforms,
    };
}
async function saveCfg(c) {
    return DB.set('config', c);
}
function activePlatform(cfg) {
    return cfg.platforms.find(p => p.name === cfg.active) || cfg.platforms[0];
}

/* 语音合成：返回 Buffer */
async function synth(text, p) {
    if (!p || !p.url) throw new Error('未配置 TTS 平台');
    if (p.api === 'ttson') {
        const token = p.key || '';
        const body = {
            voice_id: Number(p.voice || 3585),
            to_lang: 'ZH',
            format: 'mp3',
            speed_factor: Number(p.speed || 1),
            pitch_factor: 0,
            volume_change_dB: 0,
            emotion: 1,
            text,
        };
        const r = await axios.post(`${p.url.replace(/\/+$/, '')}/flashsummary/tts?token=${encodeURIComponent(token)}`, body, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000,
        });
        const d = r.data || {};
        if (!d.voice_path) throw new Error('ttson 未返回 voice_path: ' + JSON.stringify(d).slice(0, 200));
        const audio = await axios.get(
            `${d.url}:${d.port}/flashsummary/retrieveFileData?stream=True&token=${encodeURIComponent(token)}&voice_audio_path=${encodeURIComponent(d.voice_path)}`,
            { responseType: 'arraybuffer', timeout: 60000 }
        );
        return Buffer.from(audio.data);
    }
    const sep = p.url.includes('?') ? '&' : '?';
    const r = await axios.get(`${p.url}${sep}text=${encodeURIComponent(text)}&key=${encodeURIComponent(p.key || '')}`, {
        responseType: 'arraybuffer',
        timeout: 60000,
    });
    return Buffer.from(r.data);
}

async function isOwnerOrAdmin(s) {
    try {
        if (await s.isAdmin()) return true;
    } catch (e) {}
    const owner = await WXDB.get('ownerId', '');
    return !!owner && s.getUserId() === owner;
}

module.exports = async s => {
    const msg = String(s.getMsg() || '').trim();
    const uid = s.getUserId();
    const cfg = await getCfg();

    // 语音 <文本>：手动合成
    if (/^(语音|朗读)\s+/i.test(msg)) {
        const text = msg.replace(/^(语音|朗读)\s+/i, '').slice(0, 500);
        const p = activePlatform(cfg);
        try {
            const buf = await synth(text, p);
            if (!buf || buf.length < 200) return s.reply('合成失败，音频为空');
            const dir = path.join(__dirname, '..', '..', 'public');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `tts-${crypto.randomBytes(6).toString('hex')}.mp3`);
            fs.writeFileSync(file, buf);
            await s.reply({ type: 'file', path: file, name: path.basename(file), msg: `[${p.name}] ${text}` });
            return;
        } catch (e) {
            return s.reply('合成失败: ' + e.message);
        }
    }

    if (!(await isOwnerOrAdmin(s))) return s.reply('仅管理员可操作 TTS 开关');

    const m = msg.match(/^(tts|TTS)\s+(开|关|状态|列表)$/i);
    if (m) {
        const act = m[2];
        if (act === '开') {
            cfg.enabled = true;
            await saveCfg(cfg);
            return s.reply(`TTS 已开启，当前平台: ${cfg.active}`);
        }
        if (act === '关') {
            cfg.enabled = false;
            await saveCfg(cfg);
            return s.reply('TTS 已关闭，恢复正常文字对话');
        }
        if (act === '列表') {
            const lines = cfg.platforms.map(p => `· ${p.name}${p.name === cfg.active ? ' (当前)' : ''} — ${p.url}`);
            return s.reply(`TTS 平台列表：\n${lines.join('\n')}`);
        }
        return s.reply(`TTS 状态: ${cfg.enabled ? '开启' : '关闭'}\n当前平台: ${cfg.active}\n平台数: ${cfg.platforms.length}`);
    }

    const sw = msg.match(/^(tts|TTS)\s+(平台|切换)\s+([^ \n]+)$/i);
    if (sw) {
        const name = sw[3];
        if (!cfg.platforms.find(p => p.name === name)) return s.reply('没有该平台: ' + name + '，用 tts 列表 查看');
        cfg.active = name;
        await saveCfg(cfg);
        return s.reply('已切换平台: ' + name);
    }

    const st = msg.match(/^(tts|TTS)\s+(设置|添加)\s+([^ \n]+)\s+([^ \n]+)\s+([^ \n]+)(?:\s+([^ \n]+))?/i);
    if (st) {
        const [, , , name, url, key, voice] = st;
        const idx = cfg.platforms.findIndex(p => p.name === name);
        const item = { name, api: 'ttson', url, key, voice: Number(voice || 3585), speed: 1 };
        if (idx >= 0) cfg.platforms[idx] = { ...cfg.platforms[idx], ...item };
        else cfg.platforms.push(item);
        cfg.active = name;
        await saveCfg(cfg);
        return s.reply(`已保存平台 ${name} 并设为当前：${url}`);
    }

    // 只发 "tts"：直接给状态
    if (/^(tts|TTS)$/i.test(msg)) {
        return s.reply(`TTS 状态: ${cfg.enabled ? '开启' : '关闭'}\n当前平台: ${cfg.active}\n用法: tts 开 / tts 关 / tts 列表 / tts 平台 <名> / tts 设置 <名> <url> <key> [voice] / 语音 <文本>`);
    }

    return 'next';
};
