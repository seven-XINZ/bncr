/**
 * @author xinz
 * @name 纪念日
 * @team xinz
 * @description 纪念日/倒计时管理，按年重复或只提醒一次，当天推送到通知路由
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^纪念日$
 * @rule ^纪念日列表$
 * @rule ^纪念日\s+列表$
 * @rule ^纪念日\s+添加\s+(\S+)\s+(\d{4}-\d{2}-\d{2})(?:\s+(每年|一次))?$
 * @rule ^纪念日\s+删除\s+(\d+)$
 * @rule ^纪念日\s+(\S+)$
 * @admin false
 * @public true
 * @priority 1000000
 * @disable false
 * @cron 0 5 9 * * *
 * @classification ["效率"]
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 */
'use strict';

const link = require('./mod/link');
const store = link.store;
const NS = 'anniversary';

const jsonSchema = BncrCreateSchema.object({
    targets: BncrCreateSchema.string()
        .setTitle('推送目标')
        .setDescription('通知路由里的目标名，逗号分隔；留空走默认目标')
        .setDefault(''),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

link.register({
    name: '纪念日',
    description: '纪念日与倒计时提醒',
    events: ['anniversary'],
    commands: ['纪念日 添加 名称 2026-12-01 每年', '纪念日列表', '纪念日 删除 ID'],
});

function dateKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function parseDate(text) {
    const m = String(text || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
}
function nextOccurrence(item, now = new Date()) {
    const base = parseDate(item.date);
    if (!base) return { date: null, days: null };
    const today = startOfDay(now);
    if (item.repeat === 'once') {
        return { date: base, days: Math.ceil((base - today) / 86400000) };
    }
    let year = today.getFullYear();
    const daysInMonth = new Date(year, base.getMonth() + 1, 0).getDate();
    let next = new Date(year, base.getMonth(), Math.min(base.getDate(), daysInMonth));
    if (next < today) {
        year++;
        const count = new Date(year, base.getMonth() + 1, 0).getDate();
        next = new Date(year, base.getMonth(), Math.min(base.getDate(), count));
    }
    return { date: next, days: Math.ceil((next - today) / 86400000) };
}
function targetList(cfg) {
    return String((cfg || {}).targets || '')
        .split(/[,，\s]+/)
        .map(x => x.trim())
        .filter(Boolean);
}
function fmtItem(item) {
    const next = nextOccurrence(item);
    if (!next.date) return `· ${item.name} · 日期异常`;
    const label = next.days === 0 ? '就是今天' : next.days > 0 ? `还有 ${next.days} 天` : `已过 ${Math.abs(next.days)} 天`;
    return `· [${item.id}] ${item.name} · ${item.date}${item.repeat === 'once' ? '（一次）' : '（每年）'} · ${label}`;
}

async function getItems() {
    const list = await store.get(NS, 'items', []);
    return Array.isArray(list) ? list : [];
}
async function saveItems(list) {
    return store.set(NS, 'items', list);
}

async function notifyToday(silent) {
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const items = await getItems();
    const today = dateKey();
    let sent = 0;
    for (const item of items) {
        const next = nextOccurrence(item);
        if (next.days !== 0 || item.lastNotifyDate === today) continue;
        link.notify(`🎉 今天是「${item.name}」\n日期：${item.date}${item.repeat === 'once' ? '' : '（每年）'}`, targetList(cfg));
        item.lastNotifyDate = today;
        sent++;
    }
    if (sent) await saveItems(items);
    if (!silent && sent) link.emit('anniversary', { sent });
    return sent;
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    const isCron = typeof s.getFrom === 'function' && s.getFrom() === 'cron';
    await ConfigDB.get();
    const items = await getItems();

    if (isCron) {
        const sent = await notifyToday(true);
        if (sent) console.info('[纪念日] 今天提醒:', sent, '条');
        return;
    }

    if (raw === '纪念日' || raw === '纪念日 帮助') {
        return s.reply('纪念日用法：\n纪念日 添加 生日 1990-05-20 每年\n纪念日 添加 项目上线 2026-12-01 一次\n纪念日列表\n纪念日 删除 ID\n纪念日 名称');
    }

    if (raw === '纪念日列表' || raw === '纪念日 列表') {
        if (!items.length) return s.reply('还没有纪念日。\n用法：纪念日 添加 生日 1990-05-20 每年');
        const sorted = items.slice().sort((a, b) => (nextOccurrence(a).days ?? 99999) - (nextOccurrence(b).days ?? 99999));
        return s.reply('📅 纪念日/倒计时\n' + sorted.map(fmtItem).join('\n'));
    }

    let m = raw.match(/^纪念日\s+添加\s+(\S+)\s+(\d{4}-\d{2}-\d{2})(?:\s+(每年|一次))?$/);
    if (m) {
        const name = m[1].slice(0, 20);
        const date = parseDate(m[2]);
        if (!date) return s.reply('日期格式不对，应该是 YYYY-MM-DD，例如 2026-12-01');
        const repeat = m[3] === '一次' ? 'once' : 'yearly';
        const id = items.reduce((n, x) => Math.max(n, Number(x.id) || 0), 0) + 1;
        const item = { id, name, date: m[2], repeat, lastNotifyDate: '', createdAt: new Date().toISOString() };
        items.push(item);
        await saveItems(items);
        link.emit('anniversary', { item });
        return s.reply(`✅ 已添加纪念日 [${id}]：${name}\n${m[2]} ${repeat === 'once' ? '只提醒一次' : '每年提醒'}\n${fmtItem(item)}`);
    }

    m = raw.match(/^纪念日\s+删除\s+(\d+)$/);
    if (m) {
        const id = Number(m[1]);
        const next = items.filter(x => x.id !== id);
        if (next.length === items.length) return s.reply('没有找到这个纪念日：' + id);
        await saveItems(next);
        return s.reply('🗑️ 已删除纪念日：' + id);
    }

    m = raw.match(/^纪念日\s+(\S+)$/);
    if (m) {
        const item = items.find(x => x.name === m[1]);
        if (!item) return s.reply('没有找到这个纪念日：' + m[1]);
        const next = nextOccurrence(item);
        return s.reply(`📅 ${item.name}\n日期：${item.date}\n${item.repeat === 'once' ? '只提醒一次' : '每年提醒'}\n下次：${next.date ? dateKey(next.date) : '无法计算'}（${next.days === 0 ? '今天' : next.days > 0 ? '还有 ' + next.days + ' 天' : '已过'}）`);
    }

    return s.reply('纪念日用法：\n纪念日 添加 生日 1990-05-20 每年\n纪念日 添加 项目上线 2026-12-01 一次\n纪念日列表\n纪念日 删除 ID');
};
