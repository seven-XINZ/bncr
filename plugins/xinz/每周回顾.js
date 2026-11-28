/**
 * @author xinz
 * @name 每周回顾
 * @team xinz
 * @version 1.0.1
 * @description 聚合 GitHub、RSS、巡检、证书、打卡、记账、纪念日、待读，生成每周回顾
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^(每周回顾|周报)$
 * @admin false
 * @public true
 * @priority 1000000
 * @disable false
 * @cron 0 0 20 * * 0
 * @classification ["效率"]
 */
'use strict';

const link = require('./mod/link');
const store = link.store;

const jsonSchema = BncrCreateSchema.object({
    targets: BncrCreateSchema.string().setTitle('推送目标').setDescription('通知路由里的目标名，逗号分隔；留空走默认目标').setDefault(''),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

link.register({
    name: '每周回顾',
    description: '聚合生态数据生成周报',
    events: ['weekly'],
    commands: ['每周回顾', '周报'],
});

function day(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return day(d);
}
function targetsOf(cfg) {
    return String((cfg || {}).targets || '')
        .split(/[,，\s]+/)
        .map(x => x.trim())
        .filter(Boolean);
}
function inRange(dateText, from, to) {
    const s = String(dateText || '').slice(0, 10);
    return s >= from && s <= to;
}
function sum(list, type) {
    return list.filter(x => x.type === type).reduce((n, x) => n + Number(x.amount || 0), 0).toFixed(2);
}
function truncate(text, n) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function buildWeekly() {
    const from = daysAgo(6);
    const to = day();
    const [repos, feeds, health, certs, habits, entries, anniversaries, readlater] = await Promise.all([
        store.get('github', 'repos', []),
        store.get('rss', 'feeds', []),
        store.get('health', 'targets', []),
        store.get('cert', 'certs', []),
        store.get('habit', 'habits', []),
        store.get('ledger', 'entries', []),
        store.get('anniversary', 'items', []),
        store.get('readlater', 'items', []),
    ]);

    const sections = [`🗓️ 每周回顾 · ${from} ~ ${to}`];

    const gh = Array.isArray(repos) ? repos : [];
    const ghNew = gh.reduce((n, r) => n + (r.lastItems || []).filter(x => inRange(x.date, from, to)).length, 0);
    if (gh.length) sections.push(`🐙 GitHub\n${gh.length} 个仓库，本周抓取到 ${ghNew} 条提交${gh.filter(x => x.lastError).length ? `，${gh.filter(x => x.lastError).length} 个异常` : ''}`);

    const rs = Array.isArray(feeds) ? feeds : [];
    const rsNew = rs.reduce((n, f) => n + (f.lastItems || []).filter(x => inRange(x.date, from, to)).length, 0);
    if (rs.length) sections.push(`📡 RSS\n${rs.length} 个订阅，本周缓存 ${rsNew} 条${rs.filter(x => x.lastError).length ? `，${rs.filter(x => x.lastError).length} 个失败` : ''}`);

    const hl = Array.isArray(health) ? health : [];
    if (hl.length) {
        const down = hl.filter(x => x.last && !x.last.ok);
        sections.push(`🩺 服务\n${hl.length} 个目标，${down.length ? '异常：' + down.map(x => x.name).join('、') : '本周巡检正常'}`);
    }

    const ce = Array.isArray(certs) ? certs : [];
    if (ce.length) {
        const near = ce.filter(x => x.last && !x.last.error && Number(x.last.days) <= 14);
        sections.push(`🔐 证书\n${ce.length} 个域名${near.length ? `，${near.length} 个 14 天内到期` : '，暂无临期'}`);
    }

    const ha = Array.isArray(habits) ? habits : [];
    if (ha.length) {
        const checks = ha.reduce((n, h) => n + Object.values(h.records || {}).reduce((m, dates) => m + (Array.isArray(dates) ? dates.filter(d => inRange(d, from, to)).length : 0), 0), 0);
        sections.push(`📅 打卡\n${ha.length} 个习惯，本周 ${checks} 次打卡`);
    }

    const le = Array.isArray(entries) ? entries : [];
    const weekEntries = le.filter(x => inRange(x.date, from, to));
    if (le.length) sections.push(`💰 记账\n本周支出 ${sum(weekEntries, 'expense')}，收入 ${sum(weekEntries, 'income')}`);

    const an = Array.isArray(anniversaries) ? anniversaries : [];
    if (an.length) {
        sections.push(`🎉 纪念日\n${an.length} 个记录，最近：${an.slice(0, 3).map(x => x.name + ' ' + x.date).join('、')}`);
    }

    const rl = Array.isArray(readlater) ? readlater : [];
    if (rl.length) sections.push(`📚 待读\n${rl.filter(x => !x.read).length} 条待读，本周新增 ${rl.filter(x => inRange(x.createdAt, from, to)).length} 条`);

    if (sections.length === 1) sections.push('这一周还没有生态数据。先去订阅、巡检或打卡，下周就有内容了。');
    sections.push('—\n回复「简报 / 联动列表」看当前状态');
    return sections.join('\n\n');
}

module.exports = async s => {
    await ConfigDB.get();
    const text = await buildWeekly();
    const isCron = typeof s.getFrom === 'function' && s.getFrom() === 'cron';
    if (isCron) {
        const result = link.notify(text, targetsOf(ConfigDB.userConfig));
        console.info('[每周回顾] 已生成并发出通知事件:', result.at);
        return;
    }
    await s.reply(text);
    link.emit('weekly', { text: truncate(text, 300) });
};
