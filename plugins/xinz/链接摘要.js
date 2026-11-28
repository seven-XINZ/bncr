/**
 * @author xinz
 * @name 链接摘要
 * @team xinz
 * @description 抓取网页标题、描述与正文摘要，可一键存入稍后读
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^摘要\s+保存\s+(\S+)(?:\s+([\s\S]+))?$
 * @rule ^摘要\s+(\S+)$
 * @rule ^摘要$
 * @admin false
 * @public true
 * @priority 1000000
 * @disable false
 * @classification ["内容"]
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 */
'use strict';

const http = require('http');
const https = require('https');
const link = require('./mod/link');
const store = link.store;

link.register({
    name: '链接摘要',
    description: '网页标题/描述/正文摘要与稍后读保存',
    events: ['summary'],
    commands: ['摘要 URL', '摘要 保存 URL 备注'],
});

function fetchText(url, redirects = 5) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (e) {
            return reject(new Error('URL 不合法'));
        }
        if (!/^https?:/.test(parsed.protocol)) return reject(new Error('只支持 http/https'));
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = lib.get(parsed, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Bncr-LinkSummary/1.0)',
                Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*',
            },
        }, res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
                res.resume();
                return resolve(fetchText(new URL(res.headers.location, parsed).toString(), redirects - 1));
            }
            if (res.statusCode >= 400) {
                res.resume();
                return reject(new Error('HTTP ' + res.statusCode));
            }
            let data = '';
            res.setEncoding('utf8');
            res.on('data', c => (data += c));
            res.on('end', () => resolve({ html: data, finalUrl: parsed.toString() }));
        });
        req.setTimeout(12000, () => req.destroy(new Error('timeout')));
        req.on('error', reject);
    });
}
function decode(s) {
    return String(s || '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function strip(html) {
    return decode(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}
function meta(html, name) {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i');
    const m = html.match(re);
    return m ? decode(m[1]).trim() : '';
}
function extract(html) {
    const title = meta(html, 'og:title') || strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]) || '';
    const desc = meta(html, 'og:description') || meta(html, 'description');
    const text = strip(html.replace(/<nav[\s\S]*?<\/nav>/gi, '').replace(/<header[\s\S]*?<\/header>/gi, '').replace(/<footer[\s\S]*?<\/footer>/gi, ''));
    const sentences = text.split(/(?<=[。！？.!?])\s*|\n+/).map(x => x.trim()).filter(x => x.length >= 12 && x.length <= 180);
    const uniq = [];
    for (const x of sentences) if (!uniq.some(y => y.includes(x) || x.includes(y))) uniq.push(x);
    const summary = uniq.slice(0, 3).join(' ');
    return { title: title.slice(0, 120), desc: desc.slice(0, 300), summary: summary.slice(0, 500), text: text.slice(0, 800) };
}
async function saveReadlater(url, title, note) {
    const items = await store.get('readlater', 'items', []);
    const list = Array.isArray(items) ? items : [];
    const item = {
        id: Date.now().toString(36),
        url,
        title: title || url,
        note: note || '',
        read: false,
        createdAt: new Date().toISOString(),
    };
    list.push(item);
    await store.set('readlater', 'items', list.slice(-500));
    link.emit('readlater', { id: item.id, url, title: item.title });
    return item;
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    if (raw === '摘要') return s.reply('链接摘要用法：\n摘要 https://example.com/article\n摘要 保存 https://example.com/article 稍后读备注');
    let m = raw.match(/^摘要\s+保存\s+(\S+)(?:\s+([\s\S]+))?$/);
    if (m) {
        if (!/^https?:\/\//i.test(m[1])) return s.reply('URL 必须是 http/https');
        try {
            const page = await fetchText(m[1]);
            const data = extract(page.html);
            const item = await saveReadlater(page.finalUrl, data.title, (m[2] || '').trim());
            return s.reply(`📚 已存入稍后读\n${data.title || page.finalUrl}\n${page.finalUrl}\nID：${item.id}${m[2] ? '\n备注：' + m[2].trim() : ''}`);
        } catch (e) {
            return s.reply('抓取失败：' + (e.code || e.message));
        }
    }
    m = raw.match(/^摘要\s+(\S+)$/);
    if (m) {
        if (!/^https?:\/\//i.test(m[1])) return s.reply('URL 必须是 http/https');
        try {
            const page = await fetchText(m[1]);
            const data = extract(page.html);
            const lines = [`🔗 ${data.title || page.finalUrl}`, page.finalUrl];
            if (data.desc) lines.push('', '简介：' + data.desc);
            if (data.summary) lines.push('', '摘要：' + data.summary);
            else if (data.text) lines.push('', '正文：' + data.text.slice(0, 400));
            lines.push('', '回复「摘要 保存 ' + page.finalUrl + ' 备注」可收藏');
            link.emit('summary', { url: page.finalUrl, title: data.title });
            return s.reply(lines.join('\n'));
        } catch (e) {
            return s.reply('抓取失败：' + (e.code || e.message));
        }
    }
    return s.reply('链接摘要用法：\n摘要 https://example.com/article\n摘要 保存 https://example.com/article 稍后读备注');
};
