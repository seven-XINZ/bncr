/**
 * @author xinz
 * @name Halo运营
 * @team xinz
 * @version 1.0.0
 * @description 读取 Halo 文章、评论、友链与站点统计，辅助博客运营
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^博客$
 * @rule ^博客\s+最新$
 * @rule ^博客\s+评论$
 * @rule ^博客\s+统计$
 * @rule ^博客\s+友链$
 * @admin false
 * @public true
 * @priority 1000000
 * @disable false
 * @classification ["内容"]
 */
'use strict';

const http = require('http');
const https = require('https');
const link = require('./mod/link');

const jsonSchema = BncrCreateSchema.object({
    baseUrl: BncrCreateSchema.string().setTitle('Halo 站点地址').setDescription('例如 https://blog.example.com').setDefault(''),
    token: BncrCreateSchema.string().setTitle('Halo API Token').setDescription('公开接口可不填；评论/统计需要时填写').setDefault(''),
    timeout: BncrCreateSchema.number().setTitle('请求超时毫秒').setDefault(12000),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

link.register({
    name: 'Halo运营',
    description: 'Halo 文章、评论、友链与统计',
    events: ['halo'],
    commands: ['博客', '博客 最新', '博客 评论', '博客 统计', '博客 友链'],
});

function requestJson(url, cfg) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const headers = { Accept: 'application/json' };
        if (cfg.token) headers.Authorization = 'Bearer ' + cfg.token;
        const req = lib.get(parsed, { headers }, res => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', c => (data += c));
            res.on('end', () => {
                if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode + (res.statusCode === 401 ? '（需要 Token）' : '')));
                try {
                    resolve(JSON.parse(data || '{}'));
                } catch (e) {
                    reject(new Error('返回不是 JSON'));
                }
            });
        });
        req.setTimeout(Number(cfg.timeout) || 12000, () => req.destroy(new Error('timeout')));
        req.on('error', reject);
    });
}
function base(cfg) {
    if (!cfg.baseUrl) throw new Error('未配置 Halo 站点地址');
    const u = cfg.baseUrl.replace(/\/$/, '');
    return /^https?:\/\//.test(u) ? u : 'https://' + u;
}
function api(cfg, path) {
    return requestJson(base(cfg) + '/apis/api.halo.run/v1alpha1' + path, cfg);
}
function contentApi(cfg, path) {
    return requestJson(base(cfg) + '/apis/api.content.halo.run/v1alpha1' + path, cfg);
}
function linkApi(cfg, path) {
    return requestJson(base(cfg) + '/apis/api.link.halo.run/v1alpha1' + path, cfg);
}
function postTitle(x) {
    return (x && x.spec && x.spec.title) || (x && x.metadata && x.metadata.name) || '未命名';
}
function postTime(x) {
    return (x && x.status && (x.status.lastModifyTime || x.status.publishTime)) || (x && x.metadata && x.metadata.creationTimestamp) || '';
}
function postUrl(x, cfg) {
    const p = x && x.status && x.status.permalink;
    if (!p) return '';
    return base(cfg) + (p.startsWith('/') ? p : '/' + p);
}
async function listPosts(cfg, size = 5) {
    const data = await contentApi(cfg, `/posts?page=0&size=${size}&sort=metadata.creationTimestamp,desc`);
    return { total: Number(data.total || 0), items: Array.isArray(data.items) ? data.items : [] };
}
async function listComments(cfg, size = 8, posts) {
    const list = posts || (await listPosts(cfg, 5)).items;
    let total = 0;
    const items = [];
    for (const post of list.slice(0, 5)) {
        const name = post && post.metadata && post.metadata.name;
        if (!name) continue;
        try {
            const data = await requestJson(base(cfg) + `/apis/api.halo.run/v1alpha1/comments?kind=Post&name=${encodeURIComponent(name)}&page=0&size=${size}`, cfg);
            total += Number(data.total || 0);
            for (const c of (data.items || [])) items.push(Object.assign({ _post: postTitle(post) }, c));
        } catch (e) {
            // 评论插件未启用或该文章不允许评论时跳过
        }
        if (items.length >= size) break;
    }
    return { total, items: items.slice(0, size) };
}
function commentText(x) {
    const spec = x.spec || {};
    return String(spec.raw || spec.content || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    if (raw === '博客') {
        try {
            const posts = await listPosts(cfg, 3);
            const comments = await listComments(cfg, 3, posts.items);
            const lines = [`📝 Halo 运营`, `文章：${posts.total} 篇`, `评论：${comments.total} 条`, '最新文章：'];
            lines.push(posts.items.length ? posts.items.map(x => '· ' + postTitle(x)).join('\n') : '· 暂无');
            return s.reply(lines.join('\n'));
        } catch (e) {
            return s.reply('博客查询失败：' + e.message + '\n请检查 baseUrl，评论/统计可能需要在配置里填 token。');
        }
    }
    if (raw === '博客 最新') {
        try {
            const posts = await listPosts(cfg, 10);
            const lines = posts.items.map(x => {
                const url = postUrl(x, cfg);
                return `· ${postTitle(x)}${postTime(x) ? ' · ' + String(postTime(x)).slice(0, 10) : ''}${url ? '\n  ' + url : ''}`;
            });
            return s.reply(`📝 最新文章（共 ${posts.total}）\n` + (lines.join('\n') || '暂无'));
        } catch (e) {
            return s.reply('查询失败：' + e.message);
        }
    }
    if (raw === '博客 评论') {
        try {
            const posts = await listPosts(cfg, 5);
            const comments = await listComments(cfg, 10, posts.items);
            const lines = comments.items.map(x => `· ${(x.spec && x.spec.author) || '访客'}：${commentText(x) || '（空）'}`);
            return s.reply(`💬 最新评论（共 ${comments.total}）\n` + (lines.join('\n') || '暂无'));
        } catch (e) {
            return s.reply('评论查询失败：' + e.message + '\nHalo 评论接口可能需要 Token 或评论插件。');
        }
    }
    if (raw === '博客 统计') {
        try {
            const posts = await listPosts(cfg, 1);
            const comments = await listComments(cfg, 1, posts.items);
            return s.reply(`📊 博客统计\n文章：${posts.total}\n评论：${comments.total}`);
        } catch (e) {
            return s.reply('统计失败：' + e.message);
        }
    }
    if (raw === '博客 友链') {
        try {
            const data = await linkApi(cfg, '/links?page=0&size=20');
            const items = Array.isArray(data.items) ? data.items : [];
            const lines = items.map(x => {
                const spec = x.spec || {};
                return `· ${spec.displayName || spec.name || '友链'}${spec.url ? ' · ' + spec.url : ''}`;
            });
            return s.reply('🔗 友链\n' + (lines.join('\n') || '暂无友链（可能未安装友链插件）'));
        } catch (e) {
            return s.reply('友链查询失败：' + e.message);
        }
    }
    return s.reply('Halo 运营用法：\n博客\n博客 最新\n博客 评论\n博客 统计\n博客 友链');
};
