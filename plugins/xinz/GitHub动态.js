/**
 * @author xinz
 * @name GitHub动态
 * @team xinz
 * @version 1.0.0
 * @description 订阅 GitHub 仓库提交 Atom，定时检查新提交并推送到通知路由
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^GitHub动态\s+订阅\s+(\S+)(?:\s+(\S+))?$
 * @rule ^GitHub动态列表$
 * @rule ^GitHub动态\s+检查$
 * @rule ^GitHub动态\s+取消\s+(\S+)$
 * @rule ^GitHub动态\s+(\S+)$
 * @rule ^GitHub动态$
 * @admin false
 * @public true
 * @priority 1000000
 * @disable false
 * @cron 0 15,45 * * * *
 * @classification ["工具"]
 */
'use strict';

const http = require('http');
const https = require('https');
const link = require('./mod/link');
const store = link.store;
const NS = 'github';

const jsonSchema = BncrCreateSchema.object({
    targets: BncrCreateSchema.string()
        .setTitle('推送目标')
        .setDescription('通知路由里的目标名，逗号分隔；留空走默认目标')
        .setDefault(''),
    maxItems: BncrCreateSchema.number().setTitle('每次最多推送提交数').setDefault(5),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);
let running = false;

link.register({
    name: 'GitHub动态',
    description: 'GitHub 仓库提交监控与推送',
    events: ['github'],
    commands: ['GitHub动态 订阅 owner/repo 分支', 'GitHub动态列表', 'GitHub动态 检查', 'GitHub动态 取消 owner/repo'],
});

function requestText(url, timeout = 12000) {
    return new Promise((resolve, reject) => {
        const lib = String(url).startsWith('https:') ? https : http;
        const req = lib.get(
            url,
            {
                headers: {
                    'User-Agent': 'Bncr-GitHubWatch/1.0',
                    Accept: 'application/atom+xml, text/xml, */*',
                },
            },
            res => {
                if (res.statusCode >= 400) {
                    res.resume();
                    reject(new Error('HTTP ' + res.statusCode));
                    return;
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
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function pick(block, tags) {
    for (const tag of tags) {
        const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
        const m = block.match(re);
        if (m && m[1] && decode(m[1])) return decode(m[1]);
    }
    return '';
}

function parseAtom(xml) {
    const entries = [...String(xml || '').matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(m => m[0]);
    return entries.map(entry => {
        const linkMatch = entry.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
        const linkUrl = linkMatch ? decode(linkMatch[1]) : '';
        return {
            id: pick(entry, ['id']) || linkUrl || pick(entry, ['title']),
            title: pick(entry, ['title']) || '(无标题提交)',
            link: linkUrl,
            date: pick(entry, ['updated', 'published']),
        };
    });
}

function normalizeRepo(input) {
    const raw = String(input || '').trim();
    const repo = raw
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/\.git$/i, '')
        .replace(/^\/+|\/+$/g, '');
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ? repo : '';
}

function feedUrl(repo, branch) {
    const safeBranch = String(branch || 'main')
        .split('/')
        .map(encodeURIComponent)
        .join('/');
    return `https://github.com/${repo}/commits/${safeBranch}.atom`;
}

function targetList(cfg, repo) {
    const source = repo && repo.targets && repo.targets.length ? repo.targets : (cfg || {}).targets || '';
    return (Array.isArray(source) ? source.join(',') : String(source))
        .split(/[,，\s]+/)
        .map(x => x.trim())
        .filter(Boolean);
}

async function getRepos() {
    const list = await store.get(NS, 'repos', []);
    return Array.isArray(list) ? list : [];
}
async function saveRepos(list) {
    return store.set(NS, 'repos', list);
}

async function checkAll(silent) {
    if (running) return { repos: 0, newItems: 0, text: '上一轮检查还没结束' };
    running = true;
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const maxItems = Math.max(1, Number(cfg.maxItems) || 5);
    const repos = await getRepos();
    if (!repos.length) {
        running = false;
        return { repos: 0, newItems: 0, text: '还没有订阅仓库。\n用法：GitHub动态 订阅 owner/repo main' };
    }

    let newTotal = 0;
    const lines = [];
    for (const repo of repos) {
        try {
            const xml = await requestText(repo.feedUrl);
            const items = parseAtom(xml).slice(0, 20);
            repo.lastAt = new Date().toISOString();
            repo.lastError = '';
            repo.fails = 0;
            repo.alerted = false;
            if (!repo.initialized) {
                repo.initialized = true;
                repo.seen = items.map(x => x.id).slice(0, 100);
                repo.lastItems = items.slice(0, 10);
                lines.push(`· ${repo.name}：首次抓取 ${items.length} 条，已建立基线`);
                continue;
            }
            const seen = new Set(repo.seen || []);
            const fresh = items.filter(x => !seen.has(x.id));
            repo.seen = [...new Set([...items.map(x => x.id), ...(repo.seen || [])])].slice(0, 100);
            repo.lastItems = items.slice(0, 10);
            if (fresh.length) {
                newTotal += fresh.length;
                const push = fresh.slice(0, maxItems);
                link.notify(
                    `🐙 ${repo.name} 有 ${fresh.length} 条新提交\n` +
                        push.map((x, i) => `${i + 1}. ${x.title}${x.link ? '\n' + x.link : ''}`).join('\n'),
                    targetList(cfg, repo)
                );
                lines.push(`· ${repo.name}：${fresh.length} 条新提交`);
            }
        } catch (e) {
            repo.lastAt = new Date().toISOString();
            repo.lastError = e.code || e.message;
            repo.fails = (Number(repo.fails) || 0) + 1;
            lines.push(`· ${repo.name}：抓取失败（${repo.lastError}）`);
            if (repo.fails >= 3 && !repo.alerted) {
                repo.alerted = true;
                link.alert(`GitHub 抓取失败：${repo.name}\n${repo.feedUrl}\n${repo.lastError}`, targetList(cfg, repo));
            }
        }
    }
    await saveRepos(repos);
    running = false;
    link.emit('github', { repos: repos.length, newItems: newTotal });
    if (!lines.length) lines.push('没有新提交');
    return { repos: repos.length, newItems: newTotal, text: `🐙 GitHub 动态检查\n${lines.join('\n')}` };
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    const isCron = typeof s.getFrom === 'function' && s.getFrom() === 'cron';
    await ConfigDB.get();

    if (isCron) {
        const result = await checkAll(true);
        console.info('[GitHub动态] 定时检查:', result.repos, '个仓库，新增', result.newItems);
        return;
    }

    if (raw === 'GitHub动态' || raw === 'GitHub动态 帮助') {
        return s.reply(
            'GitHub动态用法：\nGitHub动态 订阅 owner/repo main\nGitHub动态列表\nGitHub动态 检查\nGitHub动态 取消 owner/repo\nGitHub动态 owner/repo'
        );
    }

    if (raw === 'GitHub动态列表') {
        const repos = await getRepos();
        if (!repos.length) return s.reply('还没有订阅仓库。\n用法：GitHub动态 订阅 owner/repo main');
        return s.reply(
            '🐙 GitHub 订阅\n' +
                repos
                    .map(r => `· ${r.name} @ ${r.branch}${r.lastError ? ' ❌ ' + r.lastError : ''}\n  ${r.feedUrl}\n  最近检查：${r.lastAt || '未检查'}`)
                    .join('\n')
        );
    }

    if (raw === 'GitHub动态 检查') {
        const result = await checkAll(false);
        return s.reply(result.text);
    }

    let m = raw.match(/^GitHub动态\s+取消\s+(\S+)$/);
    if (m) {
        const repos = await getRepos();
        const q = m[1].trim();
        const next = repos.filter(r => r.name !== q && r.repo !== q);
        if (next.length === repos.length) return s.reply('没有找到这个订阅：' + q);
        await saveRepos(next);
        return s.reply('🗑️ 已取消 GitHub 订阅：' + q);
    }

    m = raw.match(/^GitHub动态\s+订阅\s+(\S+)(?:\s+(\S+))?$/);
    if (m) {
        const repo = normalizeRepo(m[1]);
        if (!repo) return s.reply('仓库格式不对，应该是 owner/repo，例如 seven-XINZ/bncr');
        const branch = (m[2] || 'main').replace(/[^\w./-]/g, '');
        const repos = await getRepos();
        if (repos.some(r => r.repo === repo && r.branch === branch)) return s.reply('这个仓库分支已经订阅过了');
        try {
            const url = feedUrl(repo, branch);
            const items = parseAtom(await requestText(url)).slice(0, 20);
            if (!items.length) return s.reply('抓不到提交记录：' + url + '\n检查仓库名和分支是否正确');
            const item = {
                name: repo,
                repo,
                branch,
                feedUrl: url,
                targets: [],
                initialized: true,
                seen: items.map(x => x.id).slice(0, 100),
                lastItems: items.slice(0, 10),
                lastAt: new Date().toISOString(),
                lastError: '',
                fails: 0,
                alerted: false,
                createdAt: new Date().toISOString(),
            };
            repos.push(item);
            await saveRepos(repos);
            return s.reply(`✅ 已订阅：${repo} @ ${branch}\n当前抓到 ${items.length} 条，已建立基线；之后只推送新提交。`);
        } catch (e) {
            return s.reply('订阅失败：' + (e.code || e.message));
        }
    }

    m = raw.match(/^GitHub动态\s+(\S+)$/);
    if (m && m[1] !== '检查' && m[1] !== '取消') {
        const repo = normalizeRepo(m[1]) || m[1];
        const repos = await getRepos();
        const item = repos.find(r => r.repo === repo) || repos.find(r => r.name === repo);
        if (!item) return s.reply('没有找到这个订阅：' + m[1]);
        const latest = item.lastItems || [];
        return s.reply(
            `🐙 ${item.name} @ ${item.branch}\n${latest.length ? latest.map((x, i) => `${i + 1}. ${x.date || ''} ${x.title}${x.link ? '\n' + x.link : ''}`).join('\n') : '暂无缓存，先发「GitHub动态 检查」'}`
        );
    }

    return s.reply('GitHub动态用法：\nGitHub动态 订阅 owner/repo main\nGitHub动态列表\nGitHub动态 检查\nGitHub动态 取消 owner/repo');
};
