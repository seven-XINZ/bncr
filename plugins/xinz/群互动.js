/**
 * @author xinz
 * @name 群互动
 * @team xinz
 * @description 群投票、接龙、抽奖，数据按群隔离
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^投票(?:$|\s+[\s\S]+)$
 * @rule ^接龙(?:$|\s+[\s\S]+)$
 * @rule ^抽奖(?:$|\s+[\s\S]+)$
 * @admin false
 * @public true
 * @priority 1000000
 * @disable false
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 * @classification ["群管理"]
 */
'use strict';

const link = require('./mod/link');
const store = link.store;
const NS = 'group_fun';

link.register({
    name: '群互动',
    description: '投票/接龙/抽奖',
    events: ['group'],
    commands: ['投票 创建 问题 选项A 选项B', '投票 选项 A', '投票 结束', '接龙 创建 标题', '接龙 报名 内容', '接龙 结束', '抽奖 创建 奖品', '抽奖 加入', '抽奖 开奖'],
});

function groupKey(s) {
    return String((typeof s.getGroupId === 'function' && s.getGroupId()) || 'private');
}
function userName(s) {
    return String((typeof s.getName === 'function' && s.getName()) || (typeof s.getUserId === 'function' && s.getUserId()) || '访客');
}
async function getGroup(s) {
    const all = await store.get(NS, 'groups', {});
    const key = groupKey(s);
    if (!all[key]) all[key] = { votes: {}, relays: {}, lotteries: {} };
    return { all, key, data: all[key] };
}
async function save(all) {
    return store.set(NS, 'groups', all);
}
function id() {
    return Date.now().toString(36).slice(-6);
}
function voteResult(v) {
    const counts = v.options.map((o, i) => ({ option: o, count: Object.values(v.votes || {}).filter(x => x === i).length }));
    return counts.map((x, i) => `${String.fromCharCode(65 + i)}. ${x.option}：${x.count} 票`).join('\n');
}
function activeVote(data) {
    return Object.entries(data.votes || {}).map(([k, v]) => ({ id: k, ...v })).filter(x => x.active).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
function activeRelay(data) {
    return Object.entries(data.relays || {}).map(([k, v]) => ({ id: k, ...v })).filter(x => x.active).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
function activeLottery(data) {
    return Object.entries(data.lotteries || {}).map(([k, v]) => ({ id: k, ...v })).filter(x => x.active).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

async function voteCmd(s, body) {
    const { all, key, data } = await getGroup(s);
    if (!body) {
        const v = activeVote(data);
        return s.reply(v ? `🗳️ ${v.question}\n${voteResult(v)}\n\n投票 选项 A / 投票 结束` : '当前没有进行中的投票。\n投票 创建 问题 选项A 选项B');
    }
    let m = body.match(/^创建\s+(\S+)\s+([\s\S]+)$/);
    if (m) {
        const options = m[2].split(/\s+/).map(x => x.trim()).filter(Boolean);
        if (options.length < 2) return s.reply('至少需要两个选项。\n投票 创建 午饭 面 饭');
        const v = { id: id(), question: m[1], options: options.slice(0, 10), votes: {}, active: true, creator: userName(s), createdAt: new Date().toISOString() };
        data.votes[v.id] = v;
        await save(all);
        return s.reply(`🗳️ 已创建投票：${v.question}\n${v.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}\n\n投票 选项 A 参与，投票 结束 查看结果`);
    }
    m = body.match(/^选项\s+(\S+)$/);
    if (m) {
        const v = activeVote(data);
        if (!v) return s.reply('当前没有进行中的投票');
        const input = m[1];
        let index = input.length === 1 ? input.toUpperCase().charCodeAt(0) - 65 : v.options.findIndex(x => x === input);
        if (index < 0 || index >= v.options.length) return s.reply('没有这个选项：' + input);
        v.votes[userName(s)] = index;
        await save(all);
        return s.reply(`✅ ${userName(s)} 投给：${v.options[index]}\n\n${voteResult(v)}`);
    }
    if (body === '结束') {
        const v = activeVote(data);
        if (!v) return s.reply('当前没有进行中的投票');
        v.active = false;
        await save(all);
        const winner = v.options.map((o, i) => ({ o, n: Object.values(v.votes || {}).filter(x => x === i).length })).sort((a, b) => b.n - a.n)[0];
        return s.reply(`🏁 投票结束：${v.question}\n${voteResult(v)}${winner && winner.n ? `\n\n领先：${winner.o}（${winner.n} 票）` : ''}`);
    }
    if (body === '列表') {
        const list = Object.entries(data.votes || {}).map(([k, v]) => ({ id: k, ...v })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
        return s.reply('🗳️ 最近投票\n' + (list.map(x => `· ${x.active ? '进行中' : '已结束'} ${x.question}（${Object.keys(x.votes || {}).length} 票）`).join('\n') || '暂无'));
    }
    return s.reply('投票用法：\n投票 创建 午饭 面 饭\n投票 选项 A\n投票 结束\n投票');
}

async function relayCmd(s, body) {
    const { all, key, data } = await getGroup(s);
    if (!body) {
        const r = activeRelay(data);
        return s.reply(r ? `⛓️ ${r.title}\n${r.entries.map((x, i) => `${i + 1}. ${x.name}：${x.text}`).join('\n') || '还没有人报名'}\n\n接龙 报名 内容 / 接龙 结束` : '当前没有进行中的接龙。\n接龙 创建 周末聚餐');
    }
    let m = body.match(/^创建\s+([\s\S]+)$/);
    if (m) {
        const r = { id: id(), title: m[1].trim(), entries: [], active: true, creator: userName(s), createdAt: new Date().toISOString() };
        data.relays[r.id] = r;
        await save(all);
        return s.reply(`⛓️ 已创建接龙：${r.title}\n接龙 报名 内容`);
    }
    m = body.match(/^报名\s+([\s\S]+)$/);
    if (m) {
        const r = activeRelay(data);
        if (!r) return s.reply('当前没有进行中的接龙');
        const text = m[1].trim().slice(0, 120);
        if (r.entries.some(x => x.user === userName(s))) return s.reply('你已经报名过了');
        r.entries.push({ user: userName(s), name: userName(s), text, at: new Date().toISOString() });
        await save(all);
        return s.reply(`✅ 已报名：${text}\n${r.entries.map((x, i) => `${i + 1}. ${x.name}：${x.text}`).join('\n')}`);
    }
    if (body === '列表') {
        const r = activeRelay(data);
        return s.reply(r ? `⛓️ ${r.title}\n${r.entries.map((x, i) => `${i + 1}. ${x.name}：${x.text}`).join('\n') || '暂无报名'}` : '当前没有进行中的接龙');
    }
    if (body === '结束') {
        const r = activeRelay(data);
        if (!r) return s.reply('当前没有进行中的接龙');
        r.active = false;
        await save(all);
        return s.reply(`🏁 接龙结束：${r.title}\n共 ${r.entries.length} 人\n${r.entries.map((x, i) => `${i + 1}. ${x.name}：${x.text}`).join('\n')}`);
    }
    return s.reply('接龙用法：\n接龙 创建 周末聚餐\n接龙 报名 带饮料\n接龙 列表\n接龙 结束');
}

async function lotteryCmd(s, body) {
    const { all, key, data } = await getGroup(s);
    if (!body) {
        const l = activeLottery(data);
        return s.reply(l ? `🎁 ${l.prize}\n参与：${l.participants.map(x => x.name).join('、') || '暂无'}\n\n抽奖 加入 / 抽奖 开奖` : '当前没有进行中的抽奖。\n抽奖 创建 奖品');
    }
    let m = body.match(/^创建\s+([\s\S]+)$/);
    if (m) {
        const l = { id: id(), prize: m[1].trim().slice(0, 60), participants: [], active: true, creator: userName(s), createdAt: new Date().toISOString() };
        data.lotteries[l.id] = l;
        await save(all);
        return s.reply(`🎁 已创建抽奖：${l.prize}\n抽奖 加入 参与，抽奖 开奖 抽签`);
    }
    if (body === '加入') {
        const l = activeLottery(data);
        if (!l) return s.reply('当前没有进行中的抽奖');
        if (l.participants.some(x => x.user === userName(s))) return s.reply('你已经参与过了');
        l.participants.push({ user: userName(s), name: userName(s), at: new Date().toISOString() });
        await save(all);
        return s.reply(`✅ 已参与：${l.prize}\n当前 ${l.participants.length} 人`);
    }
    if (body === '列表') {
        const l = activeLottery(data);
        return s.reply(l ? `🎁 ${l.prize}\n${l.participants.map((x, i) => `${i + 1}. ${x.name}`).join('\n') || '暂无参与'}` : '当前没有进行中的抽奖');
    }
    if (body === '开奖') {
        const l = activeLottery(data);
        if (!l) return s.reply('当前没有进行中的抽奖');
        if (!l.participants.length) return s.reply('还没有人参与');
        const winner = l.participants[Math.floor(Math.random() * l.participants.length)];
        l.active = false;
        l.winner = winner.name;
        await save(all);
        link.emit('group', { lottery: l.prize, winner: winner.name });
        return s.reply(`🎉 开奖：${l.prize}\n中奖：${winner.name}\n共 ${l.participants.length} 人参与`);
    }
    if (body === '结束') {
        const l = activeLottery(data);
        if (!l) return s.reply('当前没有进行中的抽奖');
        l.active = false;
        await save(all);
        return s.reply('已结束抽奖：' + l.prize);
    }
    return s.reply('抽奖用法：\n抽奖 创建 奖品\n抽奖 加入\n抽奖 列表\n抽奖 开奖');
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    let m = raw.match(/^投票(?:\s+([\s\S]+))?$/);
    if (m) return voteCmd(s, (m[1] || '').trim());
    m = raw.match(/^接龙(?:\s+([\s\S]+))?$/);
    if (m) return relayCmd(s, (m[1] || '').trim());
    m = raw.match(/^抽奖(?:\s+([\s\S]+))?$/);
    if (m) return lotteryCmd(s, (m[1] || '').trim());
};
