/**
 * @author xinz
 * @name plugin-kit
 * @team xinz
 * @description 插件公共工具：错误兜底、HTTP 客户端、消息分片、JSON 读写、格式化
 * @version 1.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @updated 2026-11-28
 * @classification ["工具"]
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** 统一 UA 与超时的 HTTP 客户端（懒加载，未用到 http 的插件不依赖 axios） */
let httpClient = null;
function getHttp() {
    if (httpClient) return httpClient;
    const axios = require('axios');
    httpClient = axios.create({
        timeout: 15000,
        maxRedirects: 5,
        headers: { 'User-Agent': 'BncrBot/1.0 (+https://github.com/seven-XINZ/bncr)' },
        validateStatus: () => true,
    });
    return httpClient;
}

/** 给插件入口加统一错误兜底：记录日志，尽量回复用户，不让异常冒到框架 */
function guard(name, handler) {
    return async function guarded(...args) {
        try {
            return await handler.apply(this, args);
        } catch (err) {
            console.error(`[${name}] 执行失败:`, err && err.stack ? err.stack : err);
            const sender = args[0];
            try {
                if (sender && typeof sender.reply === 'function') {
                    await sender.reply(`❌ ${name} 执行失败：${err && err.message ? err.message : '未知错误'}`);
                }
            } catch (replyErr) {
                console.error(`[${name}] 错误提示发送失败:`, replyErr.message);
            }
            return null;
        }
    };
}

/** 安全 JSON 解析，失败返回 fallback */
function parseJson(value, fallback = null) {
    if (typeof value !== 'string') return value == null ? fallback : value;
    try {
        return JSON.parse(value);
    } catch (e) {
        return fallback;
    }
}

/** 读取 JSON 文件，失败返回 fallback */
function readJson(file, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return fallback;
    }
}

/** 原子写 JSON 文件 */
function writeJson(file, data) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
    return true;
}

/** 按长度切分长文本，优先在换行处断开 */
function chunk(text, max = 1800) {
    const input = String(text == null ? '' : text);
    if (input.length <= max) return [input];
    const out = [];
    let rest = input;
    while (rest.length > max) {
        let cut = rest.lastIndexOf('\n', max);
        if (cut < max * 0.6) cut = max;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut).replace(/^\n/, '');
    }
    if (rest) out.push(rest);
    return out;
}

/** 依次发送分片消息 */
async function replyLong(sender, text, max = 1800) {
    const parts = chunk(text, max);
    for (const part of parts) {
        if (!part) continue;
        await sender.reply(part);
    }
    return parts.length;
}

/** 人类可读体积 */
function formatBytes(n) {
    const b = Number(n) || 0;
    if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(2) + ' GB';
    if (b >= 1024 ** 2) return (b / 1024 ** 2).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
    return b + ' B';
}

/** 毫秒转时长 */
function formatDuration(ms) {
    const n = Math.max(0, Number(ms) || 0);
    const d = Math.floor(n / 86400000);
    const h = Math.floor((n % 86400000) / 3600000);
    const m = Math.floor((n % 3600000) / 60000);
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m`;
    return `${Math.round(n / 1000)}s`;
}

/** 仅管理员可用；无管理员信息时放行，交给 Bncr 的 @admin 再兜底 */
function isAdmin(sender) {
    try {
        if (sender && typeof sender.isAdmin === 'function') return sender.isAdmin();
        const role = sender && (sender.role || (sender.getRole && sender.getRole()));
        return !role || /admin|master|owner/i.test(String(role));
    } catch (e) {
        return true;
    }
}

module.exports = {
    get http() {
        return getHttp();
    },
    guard, parseJson, readJson, writeJson, chunk, replyLong, formatBytes, formatDuration, isAdmin,
};
