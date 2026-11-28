/**
 * @author xinz
 * @name 通知路由
 * @team xinz
 * @description 统一管理通知目标，接收其他插件发出的 notify/alert 事件并推送到对应平台
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^通知列表$
 * @rule ^通知\s+([\s\S]+)$
 * @admin true
 * @public true
 * @priority 1000000
 * @disable false
 * @classification ["工具"]
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 */
'use strict';

const link = require('./mod/link');
const store = link.store;
const NS = 'notify';

link.register({
    name: '通知路由',
    description: '统一通知目标与事件推送',
    events: ['notify', 'alert'],
    commands: ['通知列表', '通知 添加|删除|默认|测试|发送'],
});

async function getTargets() {
    const list = await store.get(NS, 'targets', []);
    return Array.isArray(list) ? list : [];
}
async function saveTargets(list) {
    return store.set(NS, 'targets', list);
}
async function getDefault() {
    return (await store.get(NS, 'default', '')) || '';
}

function findTarget(list, name) {
    const q = String(name || '').trim();
    return list.find(t => t.name === q) || list.find(t => t.name.toLowerCase() === q.toLowerCase()) || null;
}

function parseRawTarget(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/^(.+?):(群|用户|group|user):(.+)$/);
    if (m) {
        const isGroup = /群|group/i.test(m[2]);
        return { platform: m[1], [isGroup ? 'groupId' : 'userId']: m[3], name: s };
    }
    return null;
}

function resolveTargets(list, refs) {
    const out = [];
    for (const ref of refs || []) {
        if (!ref) continue;
        if (typeof ref === 'object' && ref.platform) {
            out.push(ref);
            continue;
        }
        const byName = findTarget(list, ref);
        if (byName) {
            out.push(byName);
            continue;
        }
        const byRaw = parseRawTarget(ref);
        if (byRaw) out.push(byRaw);
    }
    return out;
}

async function dispatch(evt, isAlert) {
    const text = String((evt && evt.text) || '').trim();
    if (!text) return 0;
    const targets = await getTargets();
    let refs = Array.isArray(evt.targets) ? evt.targets : evt.targets ? [evt.targets] : [];
    if (!refs.length) {
        const def = await getDefault();
        if (def) refs = [def];
        else if (targets.length === 1) refs = [targets[0].name];
    }
    const resolved = resolveTargets(targets, refs);
    if (!resolved.length) {
        console.warn('[通知路由] 没有可用目标，事件未推送:', text.slice(0, 80));
        return 0;
    }
    let ok = 0;
    for (const target of resolved) {
        const result = await link.pushText(target, isAlert ? '⚠️ ' + text : text);
        if (result.ok) ok++;
        else console.warn('[通知路由] 推送失败:', target.name || target, result.error);
    }
    return ok;
}

link.on('notify', evt => dispatch(evt, false));
link.on('alert', evt => dispatch(evt, true));

function listText(list, def) {
    if (!list.length) return '还没有通知目标。\n用法：通知 添加 主群 qq 群 123456';
    return list
        .map(t => {
            const where = t.groupId ? `群 ${t.groupId}` : `用户 ${t.userId}`;
            return `· ${t.name}${t.name === def ? '（默认）' : ''} → ${t.platform} ${where}`;
        })
        .join('\n');
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    const list = await getTargets();
    const def = await getDefault();

    if (raw === '通知列表') {
        return s.reply('📮 通知目标\n' + listText(list, def) + '\n\n添加：通知 添加 名称 平台 群|用户 ID\n删除：通知 删除 名称\n默认：通知 默认 名称\n测试：通知 测试 名称 内容');
    }

    const rest = raw.replace(/^通知\s+/, '').trim();
    if (!rest || rest === '帮助') {
        return s.reply('通知路由用法：\n通知列表\n通知 添加 主群 qq 群 123456\n通知 添加 我 tgBot 用户 789\n通知 删除 主群\n通知 默认 主群\n通知 测试 主群 这是一条测试\n通知 发送 主群 内容');
    }

    let m = rest.match(/^(添加|新增)\s+(\S+)\s+(\S+)\s+(群|用户|group|user)\s+(\S+)$/i);
    if (m) {
        const name = m[2];
        const platform = m[3];
        const isGroup = /群|group/i.test(m[4]);
        const id = m[5];
        const item = { name, platform, [isGroup ? 'groupId' : 'userId']: id, createdAt: new Date().toISOString() };
        const next = list.filter(t => t.name !== name);
        next.push(item);
        await saveTargets(next);
        return s.reply(`✅ 已添加通知目标：${name} → ${platform} ${isGroup ? '群' : '用户'} ${id}`);
    }

    m = rest.match(/^(删除|移除)\s+(\S+)$/);
    if (m) {
        const name = m[2];
        const next = list.filter(t => t.name !== name);
        if (next.length === list.length) return s.reply('没有找到这个目标：' + name);
        await saveTargets(next);
        if (def === name) await store.set(NS, 'default', '');
        return s.reply('🗑️ 已删除通知目标：' + name);
    }

    m = rest.match(/^(默认)\s+(\S+)$/);
    if (m) {
        if (!findTarget(list, m[2])) return s.reply('没有找到这个目标：' + m[2]);
        await store.set(NS, 'default', m[2]);
        return s.reply('✅ 默认通知目标已设为：' + m[2]);
    }

    m = rest.match(/^(测试)\s+(\S+)(?:\s+([\s\S]+))?$/);
    if (m) {
        const target = findTarget(list, m[2]);
        if (!target) return s.reply('没有找到这个目标：' + m[2]);
        const text = m[3] || '这是一条来自通知路由的测试消息';
        const result = await link.pushText(target, text);
        return s.reply(result.ok ? '✅ 测试消息已发送' : '❌ 发送失败：' + result.error);
    }

    m = rest.match(/^(发送)\s+(\S+)\s+([\s\S]+)$/);
    if (m) {
        const target = findTarget(list, m[2]);
        if (!target) return s.reply('没有找到这个目标：' + m[2]);
        const result = await link.pushText(target, m[3]);
        return s.reply(result.ok ? '✅ 已发送' : '❌ 发送失败：' + result.error);
    }

    return s.reply('没看懂。\n通知列表\n通知 添加 主群 qq 群 123456\n通知 测试 主群 内容');
};
