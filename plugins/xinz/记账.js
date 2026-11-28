/**
 * @author xinz
 * @name 记账
 * @team xinz
 * @description 轻量收支记账：支出/收入、本月汇总、分类统计，数据供每日简报读取
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^记账列表$
 * @rule ^记账\s+本月$
 * @rule ^记账\s+删除\s+(\d+)$
 * @rule ^记账\s+(支出|收入)\s+(\d+(?:\.\d{1,2})?)\s+([\s\S]+)$
 * @rule ^记账\s+([^\d\s][\s\S]*?)\s+(\d+(?:\.\d{1,2})?)$
 * @rule ^记账$
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

const link = require('./mod/link');
const store = link.store;
const NS = 'ledger';

link.register({
    name: '记账',
    description: '轻量收支记账与月度汇总',
    events: ['ledger'],
    commands: ['记账 支出 35 午饭', '记账 收入 1000 工资', '记账列表', '记账 本月', '记账 删除 ID'],
});

function dateKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthKey(d = new Date()) {
    return dateKey(d).slice(0, 7);
}
function money(n) {
    return Number(n || 0).toFixed(2);
}
function userOf(s) {
    try {
        const id = typeof s.getUserId === 'function' ? s.getUserId() : '';
        return id ? String(id) : '';
    } catch (e) {
        return '';
    }
}

async function getEntries() {
    const list = await store.get(NS, 'entries', []);
    return Array.isArray(list) ? list : [];
}
async function saveEntries(list) {
    return store.set(NS, 'entries', list);
}

function fmtEntry(e) {
    const sign = e.type === 'income' ? '+' : '-';
    return `[${e.id}] ${sign}${money(e.amount)} · ${e.category}${e.note ? ' · ' + e.note : ''} · ${e.date}`;
}

function summary(entries, month) {
    const list = entries.filter(e => e.month === month || String(e.date).startsWith(month));
    const income = list.filter(e => e.type === 'income').reduce((n, e) => n + Number(e.amount || 0), 0);
    const expense = list.filter(e => e.type === 'expense').reduce((n, e) => n + Number(e.amount || 0), 0);
    const byCategory = {};
    for (const e of list.filter(x => x.type === 'expense')) {
        byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount || 0);
    }
    const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { list, income, expense, balance: income - expense, top };
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    const entries = await getEntries();

    if (raw === '记账') {
        return s.reply('记账用法：\n记账 支出 35 午饭\n记账 收入 1000 工资\n记账 午饭 35\n记账列表\n记账 本月\n记账 删除 ID');
    }

    if (raw === '记账列表') {
        if (!entries.length) return s.reply('还没有账目。\n先发「记账 支出 35 午饭」记一笔。');
        const recent = entries.slice(-15);
        const month = summary(entries, monthKey());
        return s.reply(
            '💰 最近账目\n' +
                recent.map(fmtEntry).join('\n') +
                `\n\n本月收入 ${money(month.income)} · 支出 ${money(month.expense)} · 结余 ${money(month.balance)}`
        );
    }

    if (raw === '记账 本月' || raw === '记账本月') {
        const month = monthKey();
        const data = summary(entries, month);
        if (!data.list.length) return s.reply(`${month} 还没有账目。`);
        return s.reply(
            `💰 ${month} 账单\n` +
                `收入：${money(data.income)}\n` +
                `支出：${money(data.expense)}\n` +
                `结余：${money(data.balance)}\n` +
                (data.top.length ? '\n支出分类：\n' + data.top.map(([k, v]) => `· ${k}：${money(v)}`).join('\n') : '')
        );
    }

    let m = raw.match(/^记账\s+删除\s+(\d+)$/);
    if (m) {
        const id = Number(m[1]);
        const next = entries.filter(e => e.id !== id);
        if (next.length === entries.length) return s.reply('没有找到这笔账：' + id);
        await saveEntries(next);
        return s.reply('🗑️ 已删除账目：' + id);
    }

    m = raw.match(/^记账\s+(支出|收入)\s+(\d+(?:\.\d{1,2})?)\s+([\s\S]+)$/);
    let type = '';
    let amount = 0;
    let category = '';
    let note = '';
    if (m) {
        type = m[1] === '收入' ? 'income' : 'expense';
        amount = Number(m[2]);
        const desc = m[3].trim();
        const parts = desc.split(/\s+/);
        category = parts[0];
        note = parts.slice(1).join(' ');
    } else {
        m = raw.match(/^记账\s+([^\d\s][\s\S]*?)\s+(\d+(?:\.\d{1,2})?)$/);
        if (m) {
            type = 'expense';
            amount = Number(m[2]);
            category = m[1].trim();
            note = '';
        }
    }

    if (type) {
        if (!Number.isFinite(amount) || amount <= 0) return s.reply('金额需要是大于 0 的数字，例如 35 或 12.50');
        const id = entries.reduce((n, e) => Math.max(n, Number(e.id) || 0), 0) + 1;
        const today = dateKey();
        const entry = {
            id,
            type,
            amount,
            category: category.slice(0, 20) || '其他',
            note: note.slice(0, 60),
            user: userOf(s),
            date: today,
            month: today.slice(0, 7),
            createdAt: new Date().toISOString(),
        };
        entries.push(entry);
        await saveEntries(entries);
        link.emit('ledger', { entry });
        const month = summary(entries, monthKey());
        return s.reply(
            `💰 已记一笔 ${type === 'income' ? '收入' : '支出'} ${money(amount)} · ${entry.category}${entry.note ? ' · ' + entry.note : ''}\n` +
                `本月支出 ${money(month.expense)}，收入 ${money(month.income)}`
        );
    }

    return s.reply('记账用法：\n记账 支出 35 午饭\n记账 收入 1000 工资\n记账 午饭 35\n记账列表\n记账 本月\n记账 删除 ID');
};
