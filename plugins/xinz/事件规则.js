/**
 * @author xinz
 * @name 事件规则
 * @team xinz
 * @version 1.0.0
 * @description 监听联动总线事件，按规则调用其它插件，形成自动化工作流
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^规则$
 * @rule ^规则\s+列表$
 * @rule ^规则\s+添加\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+([\s\S]+))?$
 * @rule ^规则\s+删除\s+(\S+)$
 * @rule ^规则\s+启用\s+(\S+)$
 * @rule ^规则\s+停用\s+(\S+)$
 * @rule ^规则\s+测试\s+(\S+)$
 * @admin true
 * @public true
 * @priority 1000000
 * @disable false
 * @classification ["自动化"]
 */
'use strict';

const link = require('./mod/link');
const store = link.store;
const NS = 'rules';
const ALLOWED_EVENTS = ['notify', 'alert', 'watch', 'content', 'domain', 'cert', 'github', 'nas', 'device', 'group', 'weekly', 'readlater', 'summary', 'halo', 'rule'];

link.register({
    name: '事件规则',
    description: '事件到插件命令的规则引擎',
    events: ['rule'],
    commands: ['规则', '规则 添加 名称 事件 插件 命令', '规则 测试 名称', '规则 启用 名称'],
});

function id() {
    return Date.now().toString(36).slice(-6);
}
async function getRules() {
    const list = await store.get(NS, 'items', []);
    return Array.isArray(list) ? list : [];
}
async function saveRules(list) {
    return store.set(NS, 'items', list);
}
function fmt(r) {
    return `${r.enabled ? '🟢' : '⚪'} ${r.name}：${r.event} → ${r.plugin} ${r.command}${r.lastError ? ' · ' + r.lastError : ''}`;
}
function applyTemplate(template, evt) {
    const fields = Object.assign({}, evt || {});
    return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
        const v = fields[key];
        if (v === undefined || v === null) return '';
        return typeof v === 'object' ? JSON.stringify(v).slice(0, 500) : String(v);
    });
}

async function runRule(rule, evt) {
    if (!rule.enabled) return { ok: false, error: '规则已停用' };
    const command = applyTemplate(rule.command, evt);
    const result = await link.callPlugin(rule.plugin, command, { from: 'rule', timeout: 30000 });
    rule.lastAt = new Date().toISOString();
    rule.lastError = result.error || '';
    rule.lastOutput = String(result.output || '').slice(0, 300);
    rule.runs = (Number(rule.runs) || 0) + 1;
    const rules = await getRules();
    const target = rules.find(x => x.id === rule.id);
    if (target) {
        Object.assign(target, { lastAt: rule.lastAt, lastError: rule.lastError, lastOutput: rule.lastOutput, runs: rule.runs });
        await saveRules(rules);
    }
    link.emit('rule', { name: rule.name, event: evt.event, ok: result.ok, error: result.error || '', output: rule.lastOutput });
    return result;
}

let ruleRunning = false;
link.on('*', async evt => {
    if (!evt || evt.event === 'rule' || ruleRunning) return;
    ruleRunning = true;
    try {
        const rules = await getRules();
        for (const rule of rules) {
            if (!rule.enabled) continue;
            if (rule.event !== '*' && rule.event !== evt.event) continue;
            try {
                await runRule(rule, evt);
            } catch (e) {
                console.error('[事件规则] 执行失败:', rule.name, e.message);
            }
        }
    } finally {
        ruleRunning = false;
    }
});

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    if (raw === '规则') return s.reply('事件规则用法：\n规则 列表\n规则 添加 名称 事件 插件 命令\n规则 删除 名称\n规则 启用/停用 名称\n规则 测试 名称\n\n可用事件：' + ALLOWED_EVENTS.join('、') + '\n命令里可用 {text} {name} {url} 等事件字段。');
    if (raw === '规则 列表' || raw === '规则列表') {
        const rules = await getRules();
        return s.reply('🧩 事件规则\n' + (rules.length ? rules.map(fmt).join('\n') : '暂无规则'));
    }
    let m = raw.match(/^规则\s+添加\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+([\s\S]+))?$/);
    if (m) {
        const rules = await getRules();
        if (rules.some(x => x.name === m[1])) return s.reply('这个规则名已存在：' + m[1]);
        if (!ALLOWED_EVENTS.includes(m[2]) && m[2] !== '*') return s.reply('事件不在可用列表：' + m[2] + '\n可用：' + ALLOWED_EVENTS.join('、'));
        const rule = { id: id(), name: m[1], event: m[2], plugin: m[3], command: (m[4] || '').trim(), enabled: true, runs: 0, lastAt: '', lastError: '', createdAt: new Date().toISOString() };
        rules.push(rule);
        await saveRules(rules);
        return s.reply(`✅ 已添加规则：${rule.name}\n${rule.event} → ${rule.plugin} ${rule.command}`);
    }
    m = raw.match(/^规则\s+删除\s+(\S+)$/);
    if (m) {
        const rules = await getRules();
        const next = rules.filter(x => x.name !== m[1]);
        if (next.length === rules.length) return s.reply('没有找到这个规则：' + m[1]);
        await saveRules(next);
        return s.reply('🗑️ 已删除规则：' + m[1]);
    }
    m = raw.match(/^规则\s+(启用|停用)\s+(\S+)$/);
    if (m) {
        const rules = await getRules();
        const rule = rules.find(x => x.name === m[2]);
        if (!rule) return s.reply('没有找到这个规则：' + m[2]);
        rule.enabled = m[1] === '启用';
        await saveRules(rules);
        return s.reply(`✅ ${rule.name} 已${rule.enabled ? '启用' : '停用'}`);
    }
    m = raw.match(/^规则\s+测试\s+(\S+)$/);
    if (m) {
        const rule = (await getRules()).find(x => x.name === m[1]);
        if (!rule) return s.reply('没有找到这个规则：' + m[1]);
        const result = await runRule(rule, { event: rule.event === '*' ? 'notify' : rule.event, text: '测试事件', name: rule.name, url: 'https://example.com' });
        return s.reply(`🧪 规则测试：${rule.name}\n${result.ok ? '成功' : '失败'}${result.error ? '：' + result.error : ''}\n输出：${String(result.output || '（无）').slice(0, 300)}`);
    }
    return s.reply('事件规则用法：\n规则 列表\n规则 添加 名称 事件 插件 命令\n规则 测试 名称');
};
