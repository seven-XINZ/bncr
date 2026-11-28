/**
 * @author xinz
 * @name 习惯打卡
 * @team xinz
 * @description 习惯打卡、连续天数、今日完成和近 7 天统计，数据供每日简报读取
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^打卡$
 * @rule ^打卡列表$
 * @rule ^打卡\s+统计\s+(\S+)$
 * @rule ^打卡\s+撤销\s+(\S+)$
 * @rule ^打卡\s+(\S+)$
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
const NS = 'habit';

link.register({
    name: '习惯打卡',
    description: '习惯打卡与连续天数统计',
    events: ['habit'],
    commands: ['打卡 习惯名', '打卡列表', '打卡 统计 习惯名', '打卡 撤销 习惯名'],
});

function dateKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayBefore(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - n);
    return x;
}
function uidOf(s) {
    try {
        const id = typeof s.getUserId === 'function' ? s.getUserId() : '';
        if (id) return String(id);
        const name = typeof s.getUserName === 'function' ? s.getUserName() : '';
        return name ? 'name:' + String(name) : 'anonymous';
    } catch (e) {
        return 'anonymous';
    }
}
function myDates(item, uid) {
    return (item.records && Array.isArray(item.records[uid])) ? item.records[uid] : [];
}
function streakOf(dates) {
    if (!dates.length) return 0;
    const today = new Date();
    let count = 0;
    let cursor = dates.includes(dateKey(today)) ? today : dayBefore(today, 1);
    while (dates.includes(dateKey(cursor))) {
        count++;
        cursor = dayBefore(cursor, 1);
    }
    return count;
}
function last7(dates) {
    return Array.from({ length: 7 }, (_, i) => {
        const key = dateKey(dayBefore(new Date(), 6 - i));
        return { day: key.slice(5), done: dates.includes(key) };
    });
}

async function getHabits() {
    const list = await store.get(NS, 'habits', []);
    return Array.isArray(list) ? list : [];
}
async function saveHabits(list) {
    return store.set(NS, 'habits', list);
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    const habits = await getHabits();
    const uid = uidOf(s);

    if (raw === '打卡') {
        return s.reply('习惯打卡用法：\n打卡 早起\n打卡列表\n打卡 统计 早起\n打卡 撤销 早起');
    }

    if (raw === '打卡列表' || raw === '打卡 列表') {
        if (!habits.length) return s.reply('还没有习惯。\n先发「打卡 早起」创建并完成今天的打卡。');
        const today = dateKey();
        return s.reply(
            '📅 习惯打卡\n' +
                habits
                    .map(h => {
                        const people = Object.keys(h.records || {}).filter(k => myDates(h, k).includes(today)).length;
                        const mine = myDates(h, uid);
                        return `· ${h.name} · 今日 ${people} 人 · 我连续 ${streakOf(mine)} 天`;
                    })
                    .join('\n') +
                '\n\n统计：打卡 统计 习惯名'
        );
    }

    let m = raw.match(/^打卡\s+统计\s+(\S+)$/);
    if (m) {
        const item = habits.find(h => h.name === m[1]);
        if (!item) return s.reply('没有这个习惯：' + m[1]);
        const mine = myDates(item, uid);
        const today = dateKey();
        const totalPeople = Object.keys(item.records || {}).filter(k => myDates(item, k).length).length;
        const todayPeople = Object.keys(item.records || {}).filter(k => myDates(item, k).includes(today)).length;
        return s.reply(
            `📅 ${item.name}\n` +
                `今日：${todayPeople} 人\n` +
                `总计：${totalPeople} 人参与\n` +
                `我的连续：${streakOf(mine)} 天，累计 ${mine.length} 天\n` +
                `近 7 天：${last7(mine).map(x => (x.done ? '✅' : '⬜') + x.day).join(' ')}`
        );
    }

    m = raw.match(/^打卡\s+撤销\s+(\S+)$/);
    if (m) {
        const item = habits.find(h => h.name === m[1]);
        if (!item) return s.reply('没有这个习惯：' + m[1]);
        const dates = myDates(item, uid);
        const today = dateKey();
        const next = dates.filter(d => d !== today);
        if (next.length === dates.length) return s.reply('今天还没有打卡：' + item.name);
        item.records = item.records || {};
        item.records[uid] = next;
        await saveHabits(habits);
        link.emit('habit', { name: item.name, uid, action: 'undo' });
        return s.reply(`↩️ 已撤销今天的打卡：${item.name}`);
    }

    m = raw.match(/^打卡\s+(\S+)$/);
    if (m) {
        const name = m[1].slice(0, 20);
        let item = habits.find(h => h.name === name);
        if (!item) {
            item = { name, records: {}, createdAt: new Date().toISOString() };
            habits.push(item);
        }
        const dates = myDates(item, uid);
        const today = dateKey();
        if (dates.includes(today)) {
            return s.reply(`今天已经打过卡了：${name}\n连续 ${streakOf(dates)} 天`);
        }
        item.records = item.records || {};
        item.records[uid] = [...dates, today].slice(-366);
        await saveHabits(habits);
        link.emit('habit', { name, uid, action: 'checkin' });
        return s.reply(`✅ 打卡成功：${name}\n连续 ${streakOf(item.records[uid])} 天，累计 ${item.records[uid].length} 天`);
    }

    return s.reply('习惯打卡用法：\n打卡 早起\n打卡列表\n打卡 统计 早起\n打卡 撤销 早起');
};
