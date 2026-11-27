#!/usr/bin/env node
/**
 * mod/kb-sync.js —— 博客 RSS 增量同步
 *
 * 作用：抓 Halo 的 /rss.xml（拿不到就退回 /sitemap.xml），把 blog.md 里还没有的
 * 新文章按「标题 + 链接」追加进去，供本地知识库检索。
 *
 * 用法：
 *   node mod/kb-sync.js            # 正常同步
 *   node mod/kb-sync.js --dry      # 只打印，不写文件
 *
 * 依赖：Node 内置 http/https，无第三方包。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const LOCAL = process.env.HALO_LOCAL || 'http://127.0.0.1:8090';
const PUBLIC = process.env.HALO_PUBLIC || 'https://blog.xinz.fun:4443';
const KB = path.join(__dirname, 'kb', 'blog.md');

function get(url, timeout = 8000) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(get(new URL(res.headers.location, url).toString(), timeout));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error('HTTP ' + res.statusCode + ' ' + url));
            }
            let data = '';
            res.setEncoding('utf8');
            res.on('data', c => (data += c));
            res.on('end', () => resolve(data));
        });
        req.on('timeout', () => req.destroy(new Error('timeout ' + url)));
        req.on('error', reject);
    });
}

function decode(s) {
    return String(s)
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
}

function norm(u) {
    return String(u).trim().replace(/\/+$/, '');
}

function parseRss(xml) {
    const out = [];
    const items = xml.split(/<item[\s>]/).slice(1);
    for (const it of items) {
        const tm = /<title>([\s\S]*?)<\/title>/.exec(it);
        const lm = /<link>([\s\S]*?)<\/link>/.exec(it);
        if (!lm) continue;
        const url = norm(decode(lm[1]));
        let title = tm ? decode(tm[1]) : '';
        title = title.replace(/\s*[·\-|]\s*鑫仔博客\s*$/, '').trim();
        if (!title) title = decodeURIComponent(url.split('/').pop() || url);
        out.push({ title, url });
    }
    return out;
}

function parseSitemap(xml) {
    const out = [];
    const re = /<loc>([\s\S]*?)<\/loc>/g;
    let m;
    while ((m = re.exec(xml))) {
        const url = norm(decode(m[1]));
        if (!/\/archives\//.test(url)) continue;
        out.push({ title: '', url });
    }
    return out;
}

function existingUrls(md) {
    const set = new Set();
    const re = /https?:\/\/[^\s)]+/g;
    let m;
    while ((m = re.exec(md))) set.add(norm(m[0].replace(/[，。；、]+$/, '')));
    return set;
}

function pageTitle(html) {
    const m = /<title>([\s\S]*?)<\/title>/i.exec(html);
    if (!m) return '';
    return decode(m[1]).replace(/\s*[·\-|]\s*鑫仔博客\s*$/, '').trim();
}

(async () => {
    const dry = process.argv.includes('--dry');
    let md = '';
    try {
        md = fs.readFileSync(KB, 'utf8');
    } catch (e) {
        console.error('读不到 blog.md：' + KB);
        process.exit(2);
    }

    let items = [];
    try {
        items = parseRss(await get(LOCAL + '/rss.xml'));
        console.log('RSS 文章：' + items.length);
    } catch (e) {
        console.error('RSS 读取失败，改用 sitemap：' + e.message);
        items = parseSitemap(await get(LOCAL + '/sitemap.xml'));
        console.log('sitemap 文章：' + items.length);
    }

    const known = existingUrls(md);
    const fresh = [];
    for (const it of items) {
        if (known.has(norm(it.url))) continue;
        let title = it.title;
        if (!title) {
            try {
                title = pageTitle(await get(it.url.replace(PUBLIC, LOCAL)));
            } catch (e) {
                title = decodeURIComponent(it.url.split('/').pop() || it.url);
            }
        }
        fresh.push({ title, url: it.url });
    }

    if (!fresh.length) {
        console.log('没有新文章，跳过写入');
        return;
    }

    const block = fresh
        .map(x => `- ${x.title.replace(/\r?\n/g, ' ')}  \n  ${x.url}`)
        .join('\n');

    if (dry) {
        console.log('新增 ' + fresh.length + ' 篇（dry-run）：\n' + block);
        return;
    }

    // 追加到文末，保留原有格式；同时刷新头部篇数
    md = md.replace(/\n*$/, '\n') + block + '\n';
    const total = (md.match(/https?:\/\/[^\s)]+\/archives\//g) || []).length;
    md = md.replace(/下面是全部\s*\d+\s*篇文章/, '下面是全部 ' + total + ' 篇文章');

    const tmp = KB + '.tmp';
    fs.writeFileSync(tmp, md, 'utf8');
    fs.renameSync(tmp, KB);
    console.log('新增 ' + fresh.length + ' 篇，当前共 ' + total + ' 篇');
})().catch(e => {
    console.error('同步失败：' + e.message);
    process.exit(1);
});
