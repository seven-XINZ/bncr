/**
 * @author xinz
 * @name 内容订阅
 * @team xinz
 * @description 视频、播客、arXiv 等内容的 RSS/Atom 订阅与新条目提醒
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^内容$
 * @rule ^内容\s+列表$
 * @rule ^订阅视频\s+(\S+)\s+(\S+)$
 * @rule ^订阅播客\s+(\S+)\s+(\S+)$
 * @rule ^订阅论文\s+(\S+)\s+(\S+)$
 * @rule ^内容\s+检查$
 * @rule ^内容\s+删除\s+(\S+)$
 * @rule ^内容\s+(\S+)$
 * @admin false
 * @public true
 * @priority 1000000
 * @disable false
 * @cron 0 0 * * * *
 * @classification ["内容"]
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 */
'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const link = require('./mod/link');
const store = link.store;
const NS = 'content';

const jsonSchema = BncrCreateSchema.object({
    targets: BncrCreateSchema.string().setTitle('推送目标').setDescription('通知路由里的目标名，逗号分隔；留空走默认目标').setDefault(''),
    maxItems: BncrCreateSchema.number().setTitle('单次最多推送条数').setDefault(5),
    timeout: BncrCreateSchema.number().setTitle('抓取超时毫秒').setDefault(12000),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);
let running = false;

link.register({
    name: '内容订阅',
    description: '视频/播客/论文 RSS 订阅与新条目提醒',
    events: ['content'],
    commands: ['订阅视频 名称 URL', '订阅播客 名称 URL', '订阅论文 名称 URL', '内容列表', '内容 检查'],
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
        const req = lib.get(parsed, { headers: { 'User-Agent': 'Bncr-Content/1.0', Accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*' } }, res => {
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
        });
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
function strip(s) {
    return decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function tag(block, name) {
    const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    return m ? m[1] : '';
}
function atomLink(block) {
    const m = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
    return m ? decode(m[1]) : '';
}
function parseFeed(xml) {
    const items = [];
    const blocks = [];
    const itemRe = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
    const entryRe = /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi;
    let m;
    while ((m = itemRe.exec(xml))) blocks.push(m[1]);
    while ((m = entryRe.exec(xml))) blocks.push(m[1]);
    for (const block of blocks) {
        const title = strip(tag(block, 'title'));
        const link = strip(tag(block, 'link')) || atomLink(block) || strip(tag(block, 'guid')) || strip(tag(block, 'id'));
        const date = strip(tag(block, 'pubDate')) || strip(tag(block, 'published')) || strip(tag(block, 'updated')) || '';
        const desc = strip(tag(block, 'description')) || strip(tag(block, 'summary')) || strip(tag(block, 'content'));
        const id = strip(tag(block, 'guid')) || strip(tag(block, 'id')) || link || title;
        if (title || link) items.push({ title: title || '(无标题)', link, date, desc: desc.slice(0, 200), id: crypto.createHash('sha1').update(String(id)).digest('hex').slice(0, 12) });
    }
    return items.slice(0, 30);
}
function targetsOf(cfg) {
    return String((cfg || {}).targets || '').split(/[,，\s]+/).map(x => x.trim()).filter(Boolean);
}
function typeName(t) {
    return t === 'video' ? '视频' : t === 'podcast' ? '播客' : '论文';
}
async function getFeeds() {
    const list = await store.get(NS, 'feeds', []);
    return Array.isArray(list) ? list : [];
}
async function saveFeeds(list) {
    return store.set(NS, 'feeds', list);
}
function fmt(f) {
    return `${f.lastError ? '🔴' : '🟢'} ${f.name} · ${typeName(f.type)} · ${f.url}${f.lastError ? ' · ' + f.lastError : ''}`;
}
async function addFeed(type, name, url) {
    if (!/^https?:\/\//i.test(url)) throw new Error('URL 必须是 http/https');
    const feeds = await getFeeds();
    if (feeds.some(x => x.name === name)) throw new Error('这个名字已经订阅过了');
    const xml = await fetchText(url, Number((ConfigDB.userConfig || {}).timeout) || 12000);
    const items = parseFeed(xml);
    if (!items.length) throw new Error('没有解析到条目，确认是 RSS/Atom 地址');
    const feed = {
        name,
        type,
        url,
        lastItems: items.slice(0, 10),
        seen: items.map(x => x.id),
        lastError: '',
        createdAt: new Date().toISOString(),
    };
    feeds.push(feed);
    await saveFeeds(feeds);
    return items.length;
}
async function checkAll() {
    if (running) return { text: '上一轮检查还没结束', added: 0 };
    running = true;
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const feeds = await getFeeds();
    if (!feeds.length) {
        running = false;
        return { text: '还没有内容订阅。\n订阅视频 名称 https://rsshub.app/...\n订阅播客 名称 https://...\n订阅论文 名称 https://export.arxiv.org/rss/cs.AI', added: 0 };
    }
    let added = 0;
    const lines = [];
    for (const feed of feeds) {
        try {
            const items = parseFeed(await fetchText(feed.url, Number(cfg.timeout) || 12000));
            if (!items.length) throw new Error('没有解析到条目');
            const seen = new Set(feed.seen || []);
            const fresh = items.filter(x => !seen.has(x.id));
            feed.lastError = '';
            feed.lastAt = new Date().toISOString();
            feed.lastItems = items.slice(0, 10);
            feed.seen = Array.from(new Set([...items.map(x => x.id), ...(feed.seen || [])])).slice(0, 100);
            if (fresh.length) {
                added += fresh.length;
                const max = Number(cfg.maxItems) || 5;
                const push = fresh.slice(0, max);
                link.notify(`📥 ${typeName(feed.type)}：${feed.name}\n${push.map(x => `· ${x.title}${x.date ? '\n  ' + x.date : ''}${x.link ? '\n  ' + x.link : ''}`).join('\n')}`, targetsOf(cfg));
                lines.push(`· ${feed.name}：${fresh.length} 条新内容`);
            }
        } catch (e) {
            feed.lastError = e.code || e.message;
            feed.lastAt = new Date().toISOString();
            lines.push(`· ${feed.name}：抓取失败（${feed.lastError}）`);
        }
    }
    await saveFeeds(feeds);
    running = false;
    link.emit('content', { added });
    return { text: `📥 内容订阅检查\n${lines.join('\n') || '没有新内容'}\n\n共 ${feeds.length} 个订阅`, added };
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    const isCron = typeof s.getFrom === 'function' && s.getFrom() === 'cron';
    await ConfigDB.get();
    if (isCron) {
        const result = await checkAll();
        console.info('[内容订阅] 新增:', result.added);
        return;
    }
    if (raw === '内容') return s.reply('内容订阅用法：\n订阅视频 名称 URL\n订阅播客 名称 URL\n订阅论文 名称 URL\n内容列表\n内容 检查\n内容 删除 名称');
    if (raw === '内容 列表' || raw === '内容列表') {
        const feeds = await getFeeds();
        return s.reply('📥 内容订阅\n' + (feeds.length ? feeds.map(fmt).join('\n') : '暂无订阅'));
    }
    if (raw === '内容 检查') return s.reply((await checkAll()).text);
    const mAdd = raw.match(/^订阅(视频|播客|论文)\s+(\S+)\s+(\S+)$/);
    if (mAdd) {
        try {
            const type = mAdd[1] === '视频' ? 'video' : mAdd[1] === '播客' ? 'podcast' : 'paper';
            const n = await addFeed(type, mAdd[2], mAdd[3]);
            return s.reply(`✅ 已订阅${mAdd[1]}：${mAdd[2]}\n解析到 ${n} 条，已建立基线。`);
        } catch (e) {
            return s.reply('订阅失败：' + (e.code || e.message));
        }
    }
    const mDel = raw.match(/^内容\s+删除\s+(\S+)$/);
    if (mDel) {
        const feeds = await getFeeds();
        const next = feeds.filter(x => x.name !== mDel[1]);
        if (next.length === feeds.length) return s.reply('没有找到这个订阅：' + mDel[1]);
        await saveFeeds(next);
        return s.reply('🗑️ 已删除订阅：' + mDel[1]);
    }
    const m = raw.match(/^内容\s+(\S+)$/);
    if (m && m[1] !== '检查' && m[1] !== '列表') {
        const feed = (await getFeeds()).find(x => x.name === m[1]);
        if (!feed) return s.reply('没有找到这个订阅：' + m[1]);
        const items = (feed.lastItems || []).slice(0, 5).map(x => `· ${x.title}${x.link ? '\n  ' + x.link : ''}`).join('\n');
        return s.reply(`📥 ${feed.name} · ${typeName(feed.type)}\n${feed.url}\n${items || '暂无缓存'}`);
    }
    return s.reply('内容订阅用法：\n订阅视频 名称 URL\n订阅播客 名称 URL\n订阅论文 名称 URL\n内容列表\n内容 检查\n内容 删除 名称');
};
