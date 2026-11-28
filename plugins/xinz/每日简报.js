/**
 * @author xinz
 * @name 每日简报
 * @team xinz
 * @description 聚合天气、热搜、RSS、服务巡检、生态数据和待读清单，生成每日简报并推送
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^(今日简报|每日简报|简报)$
 * @admin false
 * @public true
 * @priority 1000000
 * @disable false
 * @cron 0 0 8 * * *
 * @classification ["效率"]
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 */
'use strict';

const link = require('./mod/link');
const store = link.store;

const jsonSchema = BncrCreateSchema.object({
    city: BncrCreateSchema.string().setTitle('天气城市').setDefault('成都'),
    hotPlatform: BncrCreateSchema.string().setTitle('热搜平台').setDescription('微博 / 抖音 / 知乎 / bilibili').setDefault('微博'),
    maxHot: BncrCreateSchema.number().setTitle('热搜条数').setDefault(5),
    includeWeather: BncrCreateSchema.boolean().setTitle('包含天气').setDefault(true),
    includeHot: BncrCreateSchema.boolean().setTitle('包含热搜').setDefault(true),
    includeRss: BncrCreateSchema.boolean().setTitle('包含 RSS').setDefault(true),
    includeHealth: BncrCreateSchema.boolean().setTitle('包含服务巡检').setDefault(true),
    includeEcosystem: BncrCreateSchema.boolean().setTitle('包含生态数据').setDescription('GitHub / 证书 / 打卡 / 记账 / 纪念日').setDefault(true),
    includeReadlater: BncrCreateSchema.boolean().setTitle('包含待读').setDefault(true),
    targets: BncrCreateSchema.string().setTitle('推送目标').setDescription('通知路由里的目标名，逗号分隔；留空走默认目标').setDefault(''),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

link.register({
    name: '每日简报',
    description: '聚合多插件信息的每日简报',
    events: ['brief'],
    commands: ['今日简报', '每日简报', '简报'],
});

function todayText() {
    const d = new Date();
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 星期${week}`;
}

function targetList(cfg) {
    return String((cfg || {}).targets || '')
        .split(/[,，\s]+/)
        .map(x => x.trim())
        .filter(Boolean);
}

function truncate(text, n) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function weatherSection(cfg) {
    if (!cfg.includeWeather) return '';
    const city = String(cfg.city || '成都').trim();
    const r = await link.callPlugin('天气', '天气' + city, { from: 'brief' });
    if (!r.ok) return `🌤 天气\n${city}：天气插件调用失败（${r.error}）`;
    if (!r.output) return `🌤 天气\n${city}：无返回，检查天气插件配置`;
    return `🌤 天气\n${city}：${truncate(r.output, 500)}`;
}

async function hotSection(cfg) {
    if (!cfg.includeHot) return '';
    const platform = String(cfg.hotPlatform || '微博').trim();
    const max = Math.max(1, Number(cfg.maxHot) || 5);
    const r = await link.callPlugin('热点趋势', platform + '热搜', { from: 'brief' });
    if (!r.ok || !r.output) return `🔥 热搜\n${platform}：暂时取不到（${r.error || '空返回'}）`;
    const numbered = r.output
        .split(/\r?\n/)
        .map(x => x.trim())
        .filter(x => /^\d+\./.test(x))
        .slice(0, max);
    const fallback = r.output.split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, max);
    return `🔥 热搜 · ${platform}\n${(numbered.length ? numbered : fallback).join('\n')}`;
}

async function rssSection(cfg) {
    if (!cfg.includeRss) return '';
    const feeds = await store.get('rss', 'feeds', []);
    if (!Array.isArray(feeds) || !feeds.length) return '📡 RSS\n还没有订阅，发「订阅 URL 名称」添加';
    const latest = feeds
        .flatMap(f => (f.lastItems || []).slice(0, 1).map(x => ({ feed: f.name, title: x.title })))
        .slice(0, 3);
    const failed = feeds.filter(f => f.lastError).length;
    return `📡 RSS\n${feeds.length} 个订阅${failed ? `，${failed} 个抓取失败` : ''}${latest.length ? '\n' + latest.map(x => `· ${x.feed}：${truncate(x.title, 60)}`).join('\n') : ''}`;
}

async function healthSection(cfg) {
    if (!cfg.includeHealth) return '';
    const targets = await store.get('health', 'targets', []);
    if (!Array.isArray(targets) || !targets.length) return '🩺 服务\n还没有巡检目标，发「巡检 添加 名称 URL」添加';
    const down = targets.filter(t => t.last && !t.last.ok);
    return `🩺 服务\n${targets.length} 个目标，${down.length ? '异常：' + down.map(t => t.name).join('、') : '全部正常'}`;
}

function dateKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nextDays(item) {
    const m = String(item.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (item.repeat === 'once') return Math.ceil((base - start) / 86400000);
    let next = new Date(today.getFullYear(), base.getMonth(), Math.min(base.getDate(), new Date(today.getFullYear(), base.getMonth() + 1, 0).getDate()));
    if (next < start) next = new Date(today.getFullYear() + 1, base.getMonth(), Math.min(base.getDate(), new Date(today.getFullYear() + 1, base.getMonth() + 1, 0).getDate()));
    return Math.ceil((next - start) / 86400000);
}

async function ecosystemSection(cfg) {
    if (!cfg.includeEcosystem) return '';
    const [repos, certs, habits, entries, anniversaries] = await Promise.all([
        store.get('github', 'repos', []),
        store.get('cert', 'certs', []),
        store.get('habit', 'habits', []),
        store.get('ledger', 'entries', []),
        store.get('anniversary', 'items', []),
    ]);
    const lines = [];
    if (Array.isArray(repos) && repos.length) {
        const failed = repos.filter(x => x.lastError).length;
        lines.push(`· GitHub：${repos.length} 个仓库${failed ? `，${failed} 个抓取失败` : ''}`);
    }
    if (Array.isArray(certs) && certs.length) {
        const near = certs.filter(x => x.last && !x.last.error && Number(x.last.days) <= 14);
        lines.push(`· 证书：${certs.length} 个域名${near.length ? `，${near.length} 个 14 天内到期` : '，全部正常'}`);
    }
    if (Array.isArray(habits) && habits.length) {
        const today = dateKey();
        const done = habits.filter(h => Object.keys(h.records || {}).some(k => (h.records[k] || []).includes(today))).length;
        lines.push(`· 打卡：今日 ${done}/${habits.length} 个习惯有人打卡`);
    }
    if (Array.isArray(entries) && entries.length) {
        const month = dateKey().slice(0, 7);
        const expense = entries.filter(x => x.type === 'expense' && String(x.date || '').startsWith(month)).reduce((n, x) => n + Number(x.amount || 0), 0);
        lines.push(`· 记账：本月支出 ${expense.toFixed(2)}`);
    }
    if (Array.isArray(anniversaries) && anniversaries.length) {
        const next = anniversaries
            .map(x => ({ name: x.name, days: nextDays(x) }))
            .filter(x => x.days !== null && x.days >= 0)
            .sort((a, b) => a.days - b.days)[0];
        lines.push(next ? `· 纪念日：${next.name} ${next.days === 0 ? '就是今天' : `还有 ${next.days} 天`}` : `· 纪念日：${anniversaries.length} 个`);
    }
    if (!lines.length) return '🧩 生态\n暂无 GitHub / 证书 / 打卡 / 记账 / 纪念日数据';
    return '🧩 生态\n' + lines.join('\n');
}

async function readlaterSection(cfg) {
    if (!cfg.includeReadlater) return '';
    const items = await store.get('readlater', 'items', []);
    const pending = Array.isArray(items) ? items.filter(x => !x.read) : [];
    return `📚 待读\n${pending.length} 条待读${pending.length ? '，发「稍后读列表」查看' : ''}`;
}

async function buildBrief(cfg) {
    const sections = [`🌅 每日简报 · ${todayText()}`];
    for (const fn of [weatherSection, hotSection, rssSection, healthSection, ecosystemSection, readlaterSection]) {
        try {
            const section = await fn(cfg);
            if (section) sections.push(section);
        } catch (e) {
            sections.push('⚠️ 一段内容生成失败：' + e.message);
        }
    }
    sections.push('—\n回复「订阅列表 / 巡检 / 证书 / 打卡列表 / 记账列表 / 纪念日列表」查看详情');
    return sections.join('\n\n');
}

module.exports = async s => {
    await ConfigDB.get();
    const cfg = Object.assign(
        {
            city: '成都',
            hotPlatform: '微博',
            maxHot: 5,
            includeWeather: true,
            includeHot: true,
            includeRss: true,
            includeHealth: true,
            includeEcosystem: true,
            includeReadlater: true,
            targets: '',
        },
        ConfigDB.userConfig || {}
    );
    const text = await buildBrief(cfg);
    const isCron = typeof s.getFrom === 'function' && s.getFrom() === 'cron';
    if (isCron) {
        const targets = targetList(cfg);
        const result = link.notify(text, targets);
        console.info('[每日简报] 已生成并发出通知事件:', result.at);
        return;
    }
    await s.reply(text);
    link.emit('brief', { text });
};
