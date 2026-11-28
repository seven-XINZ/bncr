/**
 * @author xinz
 * @name 安全审计
 * @team xinz
 * @description 联动事件审计、Token 估算与用量统计
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^审计$
 * @rule ^审计\s+记录\s+([\s\S]+)$
 * @rule ^审计\s+统计$
 * @rule ^Token\s+([\s\S]+)$
 * @rule ^Token用量$
 * @admin true
 * @public true
 * @priority 1000000
 * @disable false
 * @classification ["运维"]
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 */
'use strict';

const link = require('./mod/link');
const store = link.store;
const NS = 'security';
const MAX = 200;

link.register({
    name: '安全审计',
    description: '事件审计与 Token 用量估算',
    events: ['security'],
    commands: ['审计', '审计 统计', 'Token 文本', 'Token用量'],
});

function estimateTokens(text) {
    const s = String(text || '');
    const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    const other = s.length - cjk;
    return Math.ceil(cjk / 1.5 + other / 4);
}
async function append(evt) {
    const text = String(evt.text || evt.output || evt.name || '');
    const item = {
        at: evt.at || new Date().toISOString(),
        event: String(evt.event || 'unknown'),
        text: text.slice(0, 200),
        tokens: estimateTokens(text),
    };
    const events = await store.get(NS, 'events', []);
    const list = Array.isArray(events) ? events : [];
    list.push(item);
    while (list.length > MAX) list.shift();
    await store.set(NS, 'events', list);
    return item;
}
link.on('*', async evt => {
    if (!evt || evt.event === 'security') return;
    try {
        await append(evt);
    } catch (e) {
        console.error('[安全审计] 记录失败:', e.message);
    }
});
function fmt(x) {
    return `· ${x.at.slice(5, 16).replace('T', ' ')} · ${x.event} · ${x.text || '（空）'} · ~${x.tokens} tokens`;
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    if (raw === '审计') {
        const events = await store.get(NS, 'events', []);
        const list = Array.isArray(events) ? events.slice(-15).reverse() : [];
        return s.reply('🛡️ 事件审计\n' + (list.length ? list.map(fmt).join('\n') : '暂无记录'));
    }
    if (raw === '审计 统计') {
        const events = await store.get(NS, 'events', []);
        const list = Array.isArray(events) ? events : [];
        const byEvent = {};
        for (const x of list) byEvent[x.event] = (byEvent[x.event] || 0) + 1;
        const tokens = list.reduce((n, x) => n + Number(x.tokens || 0), 0);
        return s.reply(`📊 审计统计\n事件：${list.length} 条\n估算 Token：${tokens}\n` + Object.entries(byEvent).map(([k, v]) => `· ${k}：${v}`).join('\n'));
    }
    let m = raw.match(/^审计\s+记录\s+([\s\S]+)$/);
    if (m) {
        const item = await append({ event: 'manual', text: m[1].trim(), at: new Date().toISOString() });
        return s.reply('✅ 已记录审计：' + item.text);
    }
    m = raw.match(/^Token\s+([\s\S]+)$/);
    if (m) {
        const text = m[1].trim();
        return s.reply(`🔢 Token 估算\n字符：${text.length}\n估算：${estimateTokens(text)} tokens\n（按中文字符 1.5 字/token、其它 4 字符/token 粗算）`);
    }
    if (raw === 'Token用量') {
        const events = await store.get(NS, 'events', []);
        const list = Array.isArray(events) ? events : [];
        const tokens = list.reduce((n, x) => n + Number(x.tokens || 0), 0);
        return s.reply(`🔢 Token 用量\n审计事件：${list.length} 条\n估算合计：${tokens} tokens\n（只统计经过联动总线的事件文本，不含平台侧真实计费）`);
    }
    return s.reply('安全审计用法：\n审计\n审计 统计\n审计 记录 内容\nToken 文本\nToken用量');
};
