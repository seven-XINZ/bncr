/**
 * @author xinz
 * @name RSS订阅
 * @team xinz
 * @description 订阅 RSS/Atom/JSON Feed，定时抓取新条目，通过通知路由推送
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^订阅\s+(https?:\/\/\S+)(?:\s+([\s\S]+))?$
 * @rule ^订阅列表$
 * @rule ^取消订阅\s+([\s\S]+)$
 * @rule ^检查订阅$
 * @rule ^RSS\s+([\s\S]+)$
 * @admin true
 * @public true
 * @priority 1000000
 * @disable false
 * @cron 0 0,30 * * * *
 * @classification ["工具"]
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 */
'use strict';

const axios = require('axios');
const link = require('./mod/link');
const store = link.store;
const NS = 'rss';

const jsonSchema = BncrCreateSchema.object({
    targets: BncrCreateSchema.string()
        .setTitle('推送目标')
        .setDescription('逗号分隔的通知目标名；留空走通知路由的默认目标')
        .setDefault(''),
    maxItems: BncrCreateSchema.number().setTitle('每次最多推送条数').setDefault(5),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);
let running = false;

link.register({
    name: 'RSS订阅',
    description: 'RSS/Atom/JSON Feed 定时抓取与推送',
    events: ['rss'],
    commands: ['订阅 URL 名称', '订阅列表', '取消订阅 名称', '检查订阅', 'RSS 名称'],
});

function decodeEntities(s) {
    return String(s || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function pick(block, tags) {
    for (const tag of tags) {
        const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
        const m = block.match(re);
        if (m && m[1] && decodeEntities(m[1])) return decodeEntities(m[1]);
    }
    return '';
}

function pickAtomLink(block) {
    const m = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
    return m ? decodeEntities(m[1]) : '';
}

function normalizeItem(item, feedName) {
    const title = String(item.title || '').trim() || '(无标题)';
    const url = String(item.link || item.url || '').trim();
    const id = String(item.id || item.guid || url || title).trim();
    return {
        id: id || link.hash(feedName + ':' + title),
        title: title.slice(0, 160),
        link: url,
        date: String(item.date || item.pubDate || '').trim(),
        feed: feedName,
    };
}

function parseFeed(body, feedName) {
    const raw = String(body || '').trim();
    if (!raw) return { title: feedName, items: [] };
    if (raw.startsWith('{')) {
        const data = JSON.parse(raw);
        return {
            title: String(data.title || feedName),
            items: (Array.isArray(data.items) ? data.items : []).map(it =>
                normalizeItem({ title: it.title, link: it.url || it.external_url, id: it.id, date: it.date_published }, feedName)
            ),
        };
    }
    const feedTitle = pick(raw, ['title']) || feedName;
    const blocks = [...raw.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(m => m[0]);
    const items = blocks.map(block => {
        const linkUrl = pick(block, ['link']) || pickAtomLink(block);
        return normalizeItem(
            {
                title: pick(block, ['title']),
                link: linkUrl,
                id: pick(block, ['guid', 'id']),
                date: pick(block, ['pubDate', 'published', 'updated', 'date']),
            },
            feedName
        );
    });
    return { title: feedTitle, items };
}

async function fetchFeed(feed) {
    const r = await axios.get(feed.url, {
        timeout: 15000,
        responseType: 'text',
        transformResponse: [d => d],
        maxRedirects: 5,
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Bncr-RSS/1.0)',
            Accept: 'application/rss+xml, application/atom+xml, application/json, text/xml, */*',
        },
    });
    return parseFeed(r.data, feed.name);
}

async function getFeeds() {
    const list = await store.get(NS, 'feeds', []);
    return Array.isArray(list) ? list : [];
}
async function saveFeeds(list) {
    return store.set(NS, 'feeds', list);
}
function targetsOf(cfg, feed) {
    const source = feed && feed.targets && feed.targets.length ? feed.targets : (cfg || {}).targets || '';
    const raw = (Array.isArray(source) ? source.join(',') : String(source))
        .split(/[,，\s]+/)
        .map(x => x.trim())
        .filter(Boolean);
    return raw;
}

async function checkAll(silent) {
    if (running) return { feeds: 0, newItems: 0, text: '上一轮检查还没结束' };
    running = true;
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const maxItems = Math.max(1, Number(cfg.maxItems) || 5);
    const feeds = await getFeeds();
    if (!feeds.length) {
        running = false;
        return { feeds: 0, newItems: 0, text: '还没有订阅。\n用法：订阅 https://example.com/feed.xml 名称' };
    }

    let newTotal = 0;
    const lines = [];
    for (const feed of feeds) {
        try {
            const parsed = await fetchFeed(feed);
            const incoming = parsed.items.slice(0, 20);
            if (!feed.initialized) {
                feed.initialized = true;
                feed.seen = incoming.map(x => x.id).slice(0, 200);
                feed.lastItems = incoming.slice(0, 10);
                feed.lastAt = new Date().toISOString();
                feed.lastError = '';
                lines.push(`· ${feed.name}：首次抓取 ${incoming.length} 条，已建立基线`);
                continue;
            }
            const seen = new Set(feed.seen || []);
            const fresh = incoming.filter(x => !seen.has(x.id));
            feed.seen = [...new Set([...incoming.map(x => x.id), ...(feed.seen || [])])].slice(0, 200);
            feed.lastItems = incoming.slice(0, 10);
            feed.lastAt = new Date().toISOString();
            feed.lastError = '';
            if (fresh.length) {
                const push = fresh.slice(0, maxItems);
                newTotal += fresh.length;
                const body = push.map((x, i) => `${i + 1}. ${x.title}${x.link ? '\n' + x.link : ''}`).join('\n');
                link.notify(`📡 ${feed.name} 有 ${fresh.length} 条更新\n${body}`, targetsOf(cfg, feed));
                lines.push(`· ${feed.name}：${fresh.length} 条新内容`);
            }
        } catch (e) {
            feed.lastError = e.code || e.message;
            feed.lastAt = new Date().toISOString();
            lines.push(`· ${feed.name}：抓取失败（${feed.lastError}）`);
            if (!silent) link.alert(`RSS 抓取失败：${feed.name}\n${feed.url}\n${feed.lastError}`, targetsOf(cfg, feed));
        }
    }
    await saveFeeds(feeds);
    running = false;
    link.emit('rss', { feeds: feeds.length, newItems: newTotal });
    if (!lines.length) lines.push('没有新内容');
    return { feeds: feeds.length, newItems: newTotal, text: `📡 RSS 检查完成\n${lines.join('\n')}` };
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    const isCron = typeof s.getFrom === 'function' && s.getFrom() === 'cron';
    await ConfigDB.get();

    if (isCron) {
        const result = await checkAll(true);
        console.info('[RSS订阅] 定时检查:', result.feeds, '个订阅，新增', result.newItems);
        return;
    }

    if (raw === '订阅列表') {
        const feeds = await getFeeds();
        if (!feeds.length) return s.reply('还没有订阅。\n用法：订阅 https://example.com/feed.xml 名称');
        return s.reply(
            '📚 RSS 订阅\n' +
                feeds
                    .map(f => `· ${f.name}${f.lastError ? ' ❌' : ''}\n  ${f.url}\n  ${f.lastItems ? f.lastItems.length : 0} 条缓存 · ${f.lastAt || '未抓取'}`)
                    .join('\n')
        );
    }

    if (raw === '检查订阅') {
        const result = await checkAll(false);
        return s.reply(result.text);
    }

    let m = raw.match(/^RSS\s+([\s\S]+)$/);
    if (m) {
        const feeds = await getFeeds();
        const feed = feeds.find(f => f.name === m[1].trim()) || feeds.find(f => f.name.includes(m[1].trim()));
        if (!feed) return s.reply('没有找到这个订阅：' + m[1]);
        const items = feed.lastItems || [];
        return s.reply(`📡 ${feed.name}\n${items.length ? items.map((x, i) => `${i + 1}. ${x.title}${x.link ? '\n' + x.link : ''}`).join('\n') : '暂无缓存，先发「检查订阅」'}`);
    }

    m = raw.match(/^取消订阅\s+([\s\S]+)$/);
    if (m) {
        const feeds = await getFeeds();
        const next = feeds.filter(f => f.name !== m[1].trim());
        if (next.length === feeds.length) return s.reply('没有找到这个订阅：' + m[1].trim());
        await saveFeeds(next);
        return s.reply('🗑️ 已取消订阅：' + m[1].trim());
    }

    m = raw.match(/^订阅\s+(https?:\/\/\S+)(?:\s+([\s\S]+))?$/);
    if (m) {
        const url = m[1];
        const requested = (m[2] || '').trim();
        let name = requested || url.replace(/^https?:\/\//, '').split('/')[0];
        const feeds = await getFeeds();
        if (feeds.some(f => f.url === url)) return s.reply('这个地址已经订阅过了');
        try {
            const parsed = await fetchFeed({ name, url });
            name = requested || parsed.title || name;
            const feed = {
                name: String(name).slice(0, 40),
                url,
                targets: [],
                initialized: true,
                seen: parsed.items.slice(0, 20).map(x => x.id).slice(0, 200),
                lastItems: parsed.items.slice(0, 10),
                lastAt: new Date().toISOString(),
                lastError: '',
                createdAt: new Date().toISOString(),
            };
            feeds.push(feed);
            await saveFeeds(feeds);
            return s.reply(`✅ 已订阅：${feed.name}\n当前抓到 ${parsed.items.length} 条，已建立基线；之后只推送新内容。`);
        } catch (e) {
            return s.reply('订阅失败：' + (e.code || e.message));
        }
    }

    return s.reply('RSS 用法：\n订阅 https://example.com/feed.xml 名称\n订阅列表\n检查订阅\nRSS 名称\n取消订阅 名称');
};
