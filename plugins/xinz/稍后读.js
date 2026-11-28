/**
 * @author xinz
 * @name 稍后读
 * @team xinz
 * @description 收藏链接、自动抓标题、列表/搜索/完成/删除，并与日报统计联动
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^稍后读\s+(https?:\/\/\S+)(?:\s+([\s\S]+))?$
 * @rule ^稍后读列表$
 * @rule ^稍后读删除\s+(\d+)$
 * @rule ^稍后读完成\s+(\d+)$
 * @rule ^稍后读搜索\s+([\s\S]+)$
 * @admin false
 * @public true
 * @priority 1000000
 * @disable false
 * @classification ["效率"]
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 */
'use strict';

const axios = require('axios');
const link = require('./mod/link');
const store = link.store;
const NS = 'readlater';

link.register({
    name: '稍后读',
    description: '链接收藏与待读清单',
    events: ['readlater'],
    commands: ['稍后读 URL 备注', '稍后读列表', '稍后读完成 ID', '稍后读删除 ID', '稍后读搜索 关键词'],
});

function decode(s) {
    return String(s || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function fetchTitle(url) {
    try {
        const r = await axios.get(url, {
            timeout: 10000,
            responseType: 'text',
            transformResponse: [d => d],
            maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bncr-ReadLater/1.0)' },
        });
        const html = String(r.data || '');
        const og = html.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)["']/i);
        const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        return decode((og && og[1]) || (title && title[1]) || '').slice(0, 160);
    } catch (e) {
        return '';
    }
}

async function getItems() {
    const list = await store.get(NS, 'items', []);
    return Array.isArray(list) ? list : [];
}
async function saveItems(list) {
    return store.set(NS, 'items', list);
}
function hostOf(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
        return '';
    }
}
function fmtItem(item) {
    return `[${item.id}] ${item.read ? '✅' : '📖'} ${item.title}\n${item.url}${item.note ? '\n备注：' + item.note : ''}`;
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    const items = await getItems();

    if (raw === '稍后读列表') {
        const pending = items.filter(x => !x.read).slice(0, 20);
        const done = items.filter(x => x.read).length;
        if (!pending.length) return s.reply(`📚 待读清单是空的${done ? `（已完成 ${done} 条）` : ''}\n用法：稍后读 https://example.com 备注`);
        return s.reply(`📚 待读清单（${pending.length} 条，已完成 ${done} 条）\n\n` + pending.map(fmtItem).join('\n\n') + '\n\n完成：稍后读完成 ID\n删除：稍后读删除 ID');
    }

    let m = raw.match(/^稍后读完成\s+(\d+)$/);
    if (m) {
        const id = Number(m[1]);
        const item = items.find(x => x.id === id);
        if (!item) return s.reply('没有找到这条收藏：' + id);
        item.read = true;
        item.readAt = new Date().toISOString();
        await saveItems(items);
        return s.reply(`✅ 已标记完成：${item.title}`);
    }

    m = raw.match(/^稍后读删除\s+(\d+)$/);
    if (m) {
        const id = Number(m[1]);
        const next = items.filter(x => x.id !== id);
        if (next.length === items.length) return s.reply('没有找到这条收藏：' + id);
        await saveItems(next);
        return s.reply('🗑️ 已删除收藏：' + id);
    }

    m = raw.match(/^稍后读搜索\s+([\s\S]+)$/);
    if (m) {
        const kw = m[1].trim().toLowerCase();
        const hits = items.filter(x => [x.title, x.url, x.note].join(' ').toLowerCase().includes(kw)).slice(0, 20);
        if (!hits.length) return s.reply('没有匹配的收藏');
        return s.reply(`🔎 找到 ${hits.length} 条\n\n` + hits.map(fmtItem).join('\n\n'));
    }

    m = raw.match(/^稍后读\s+(https?:\/\/\S+)(?:\s+([\s\S]+))?$/);
    if (m) {
        const url = m[1];
        const note = (m[2] || '').trim();
        if (items.some(x => x.url === url && !x.read)) return s.reply('这个链接已经在待读清单里了');
        const title = (await fetchTitle(url)) || hostOf(url) || url;
        const id = items.reduce((n, x) => Math.max(n, Number(x.id) || 0), 0) + 1;
        const item = {
            id,
            url,
            title,
            note,
            read: false,
            user: typeof s.getUserId === 'function' ? s.getUserId() : '',
            createdAt: new Date().toISOString(),
        };
        items.push(item);
        await saveItems(items);
        link.emit('readlater', { item });
        return s.reply(`📚 已收藏 [${id}]\n${item.title}\n${item.url}${note ? '\n备注：' + note : ''}\n\n待读清单：稍后读列表`);
    }

    return s.reply('稍后读用法：\n稍后读 https://example.com 备注\n稍后读列表\n稍后读完成 ID\n稍后读删除 ID\n稍后读搜索 关键词');
};
