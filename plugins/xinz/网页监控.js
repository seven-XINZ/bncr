/**
 * @author xinz
 * @name 网页监控
 * @team xinz
 * @version 1.0.0
 * @description 监控网页正文变化，支持关键词过滤，变化时通过通知路由提醒
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^监控\s+添加\s+(\S+)\s+(\S+)(?:\s+([\s\S]+))?$
 * @rule ^监控列表$
 * @rule ^监控\s+检查$
 * @rule ^监控\s+删除\s+(\S+)$
 * @rule ^监控\s+(\S+)$
 * @rule ^监控$
 * @admin true
 * @public true
 * @priority 1000000
 * @disable false
 * @cron 0 10,40 * * * *
 * @classification ["工具"]
 */
'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const link = require('./mod/link');
const store = link.store;
const NS = 'watch';

const jsonSchema = BncrCreateSchema.object({
    targets: BncrCreateSchema.string().setTitle('推送目标').setDescription('通知路由里的目标名，逗号分隔；留空走默认目标').setDefault(''),
    timeout: BncrCreateSchema.number().setTitle('抓取超时毫秒').setDefault(12000),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);
let running = false;

link.register({
    name: '网页监控',
    description: '网页正文变化与关键词监控',
    events: ['watch'],
    commands: ['监控 添加 名称 URL 关键词', '监控列表', '监控 检查', '监控 删除 名称'],
});

function fetchText(url, timeout, redirects = 5) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (e) {
            return reject(new Error('URL 不合法'));
        }
        if (!/^https?:/.test(parsed.protocol)) return reject(new Error('只支持 http/https'));
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = lib.get(
            parsed,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Bncr-WebWatch/1.0)',
                    Accept: 'text/html,application/xhtml+xml,text/plain,*/*',
                },
            },
            res => {
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
                    res.resume();
                    return resolve(fetchText(new URL(res.headers.location, parsed).toString(), timeout, redirects - 1));
                }
                if (res.statusCode >= 400) {
                    res.resume();
                    return reject(new Error('HTTP ' + res.statusCode));
                }
                let data = '';
                res.setEncoding('utf8');
                res.on('data', c => (data += c));
                res.on('end', () => resolve(data));
            }
        );
        req.setTimeout(timeout, () => req.destroy(new Error('timeout')));
        req.on('error', reject);
    });
}

function decode(s) {
    return String(s || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function htmlToText(html) {
    return decode(
        String(html || '')
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
    );
}
function hash(text) {
    return crypto.createHash('sha1').update(String(text)).digest('hex');
}
function snippet(text, keyword) {
    const s = String(text || '');
    if (keyword) {
        const i = s.indexOf(keyword);
        if (i >= 0) return s.slice(Math.max(0, i - 60), Math.min(s.length, i + 120));
    }
    return s.slice(0, 160);
}
function targetsOf(cfg, item) {
    const source = item && item.targets && item.targets.length ? item.targets : (cfg || {}).targets || '';
    return (Array.isArray(source) ? source.join(',') : String(source)).split(/[,，\s]+/).map(x => x.trim()).filter(Boolean);
}

async function getItems() {
    const list = await store.get(NS, 'items', []);
    return Array.isArray(list) ? list : [];
}
async function saveItems(list) {
    return store.set(NS, 'items', list);
}
function fmt(item) {
    if (!item.lastAt) return `⚪ ${item.name} · ${item.url}`;
    if (item.lastError) return `🔴 ${item.name} · ${item.lastError}`;
    return `🟢 ${item.name} · ${item.lastChange ? '最近变化 ' + item.lastChange.slice(5, 16).replace('T', ' ') : '无变化'} · 检查 ${item.lastAt.slice(5, 16).replace('T', ' ')}`;
}

async function checkAll(silent) {
    if (running) return { count: 0, changes: 0, text: '上一轮检查还没结束' };
    running = true;
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const timeout = Number(cfg.timeout) || 12000;
    const items = await getItems();
    if (!items.length) {
        running = false;
        return { count: 0, changes: 0, text: '还没有监控目标。\n用法：监控 添加 公告 https://example.com 关键词' };
    }
    let changes = 0;
    const lines = [];
    for (const item of items) {
        try {
            const body = await fetchText(item.url, timeout);
            const text = htmlToText(body);
            const h = hash(text);
            item.lastAt = new Date().toISOString();
            item.lastError = '';
            item.fails = 0;
            if (!item.snapshot) {
                item.snapshot = h;
                item.preview = snippet(text, item.keyword);
                lines.push(`· ${item.name}：建立基线`);
                continue;
            }
            if (h !== item.snapshot) {
                item.snapshot = h;
                item.preview = snippet(text, item.keyword);
                item.lastChange = new Date().toISOString();
                if (!item.keyword || text.includes(item.keyword)) {
                    changes++;
                    link.notify(`🔎 ${item.name} 有变化\n${item.url}\n${item.keyword ? '命中关键词：' + item.keyword + '\n' : ''}${item.preview}`, targetsOf(cfg, item));
                    lines.push(`· ${item.name}：已变化`);
                } else {
                    lines.push(`· ${item.name}：页面变化，但未命中关键词`);
                }
            }
        } catch (e) {
            item.lastAt = new Date().toISOString();
            item.lastError = e.code || e.message;
            item.fails = (Number(item.fails) || 0) + 1;
            lines.push(`· ${item.name}：抓取失败（${item.lastError}）`);
            if (item.fails >= 3 && !item.alerted) {
                item.alerted = true;
                link.alert(`网页监控失败：${item.name}\n${item.url}\n${item.lastError}`, targetsOf(cfg, item));
            }
        }
    }
    await saveItems(items);
    running = false;
    link.emit('watch', { count: items.length, changes });
    return { count: items.length, changes, text: `🔎 网页监控\n${lines.join('\n') || '没有变化'}\n\n共 ${items.length} 个，${changes} 个变化` };
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    const isCron = typeof s.getFrom === 'function' && s.getFrom() === 'cron';
    await ConfigDB.get();

    if (isCron) {
        const result = await checkAll(true);
        console.info('[网页监控] 检查:', result.count, '个，变化', result.changes);
        return;
    }

    if (raw === '监控') return s.reply('网页监控用法：\n监控 添加 公告 https://example.com 关键词\n监控列表\n监控 检查\n监控 删除 公告');

    if (raw === '监控列表') {
        const items = await getItems();
        if (!items.length) return s.reply('还没有监控目标。\n用法：监控 添加 公告 https://example.com 关键词');
        return s.reply('🔎 监控目标\n' + items.map(fmt).join('\n'));
    }

    if (raw === '监控 检查') {
        const result = await checkAll(false);
        return s.reply(result.text);
    }

    let m = raw.match(/^监控\s+删除\s+(\S+)$/);
    if (m) {
        const items = await getItems();
        const next = items.filter(x => x.name !== m[1]);
        if (next.length === items.length) return s.reply('没有找到这个监控：' + m[1]);
        await saveItems(next);
        return s.reply('🗑️ 已删除监控：' + m[1]);
    }

    m = raw.match(/^监控\s+添加\s+(\S+)\s+(\S+)(?:\s+([\s\S]+))?$/);
    if (m) {
        if (!/^https?:\/\//i.test(m[2])) return s.reply('URL 必须是 http/https');
        const items = await getItems();
        if (items.some(x => x.url === m[2])) return s.reply('这个地址已经在监控里了');
        try {
            const text = htmlToText(await fetchText(m[2], Number((ConfigDB.userConfig || {}).timeout) || 12000));
            const item = {
                name: m[1],
                url: m[2],
                keyword: (m[3] || '').trim(),
                snapshot: hash(text),
                preview: snippet(text, (m[3] || '').trim()),
                lastAt: new Date().toISOString(),
                lastError: '',
                fails: 0,
                alerted: false,
                createdAt: new Date().toISOString(),
            };
            items.push(item);
            await saveItems(items);
            return s.reply(`✅ 已添加监控：${item.name}\n${item.url}${item.keyword ? '\n关键词：' + item.keyword : ''}\n已建立基线。`);
        } catch (e) {
            return s.reply('添加失败：' + (e.code || e.message));
        }
    }

    m = raw.match(/^监控\s+(\S+)$/);
    if (m && m[1] !== '检查' && m[1] !== '列表') {
        const items = await getItems();
        const item = items.find(x => x.name === m[1]);
        if (!item) return s.reply('没有找到这个监控：' + m[1]);
        return s.reply(`🔎 ${item.name}\n${item.url}\n状态：${item.lastError || '正常'}\n最近：${item.lastAt || '未检查'}\n摘要：${item.preview || '暂无'}`);
    }

    return s.reply('网页监控用法：\n监控 添加 公告 https://example.com 关键词\n监控列表\n监控 检查\n监控 删除 公告');
};
