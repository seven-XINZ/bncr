/**
 * @author xinz
 * @name 服务巡检
 * @team xinz
 * @version 1.0.0
 * @description HTTP 服务健康巡检：状态、延迟、连续失败告警，可通过通知路由推送
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^巡检(?:\s+([\s\S]+))?$
 * @admin true
 * @public true
 * @priority 1000000
 * @disable false
 * @cron 0 0,5,10,15,20,25,30,35,40,45,50,55 * * * *
 * @classification ["工具"]
 */
'use strict';

const axios = require('axios');
const link = require('./mod/link');
const store = link.store;
const NS = 'health';

const jsonSchema = BncrCreateSchema.object({
    timeout: BncrCreateSchema.number().setTitle('单次超时毫秒').setDefault(10000),
    failThreshold: BncrCreateSchema.number().setTitle('连续失败几次才告警').setDefault(2),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

link.register({
    name: '服务巡检',
    description: 'HTTP 服务健康巡检与告警',
    events: ['health', 'alert'],
    commands: ['巡检', '巡检 添加|删除|列表'],
});

async function getTargets() {
    const list = await store.get(NS, 'targets', []);
    return Array.isArray(list) ? list : [];
}
async function saveTargets(list) {
    return store.set(NS, 'targets', list);
}

function fmtTarget(t) {
    const last = t.last || {};
    const icon = last.ok ? '🟢' : last.at ? '🔴' : '⚪';
    const ms = last.ms ? ` ${last.ms}ms` : '';
    const code = last.status ? ` HTTP ${last.status}` : '';
    return `${icon} ${t.name}${code}${ms}${last.error ? ' · ' + last.error : ''}`;
}

async function checkOne(t, timeout) {
    const started = Date.now();
    let ok = false;
    let status = 0;
    let error = '';
    try {
        const r = await axios.get(t.url, {
            timeout,
            maxRedirects: 5,
            validateStatus: () => true,
            headers: { 'User-Agent': 'Bncr-HealthCheck/1.0' },
        });
        status = Number(r.status) || 0;
        ok = t.expectStatus ? status === Number(t.expectStatus) : status >= 200 && status < 400;
    } catch (e) {
        error = e.code || e.message;
    }
    const ms = Date.now() - started;
    const prev = t.last || null;
    const changed = prev && prev.ok !== ok;
    t.last = { ok, status, ms, error, at: new Date().toISOString() };
    t.fails = ok ? 0 : (Number(t.fails) || 0) + 1;
    t.checks = (Number(t.checks) || 0) + 1;
    return { target: t, prev, changed, ok, status, ms, error };
}

async function runChecks(silent) {
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const timeout = Number(cfg.timeout) || 10000;
    const threshold = Math.max(1, Number(cfg.failThreshold) || 2);
    const targets = await getTargets();
    if (!targets.length) return { count: 0, down: 0, text: '还没有巡检目标。\n用法：巡检 添加 博客 https://example.com' };

    const results = [];
    for (const target of targets) results.push(await checkOne(target, timeout));
    await saveTargets(targets);

    const down = targets.filter(t => t.last && !t.last.ok).length;
    const lines = targets.map(fmtTarget);
    const text = `🩺 服务巡检\n${lines.join('\n')}\n\n共 ${targets.length} 个，异常 ${down} 个`;

    for (const r of results) {
        if (!r.ok && r.target.fails === threshold) {
            link.alert(`服务异常：${r.target.name}\n${r.target.url}\n状态：${r.status || r.error || '无响应'}，已连续失败 ${r.target.fails} 次`, r.target.targets || []);
        } else if (r.ok && r.prev && !r.prev.ok) {
            link.alert(`服务恢复：${r.target.name}\n${r.target.url}\nHTTP ${r.status}，耗时 ${r.ms}ms`, r.target.targets || []);
        }
    }
    link.emit('health', { count: targets.length, down, text });
    return { count: targets.length, down, text };
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    const rest = raw.replace(/^巡检\s*/, '').trim();
    const isCron = typeof s.getFrom === 'function' && s.getFrom() === 'cron';

    if (isCron) {
        const result = await runChecks(true);
        if (result.count) console.info('[服务巡检] 定时检查:', result.count, '异常', result.down);
        return;
    }

    if (!rest || rest === '全部' || rest === '检查') {
        const result = await runChecks(false);
        return s.reply(result.text);
    }

    if (rest === '列表') {
        const targets = await getTargets();
        if (!targets.length) return s.reply('还没有巡检目标。\n用法：巡检 添加 博客 https://example.com');
        return s.reply('🩺 巡检目标\n' + targets.map(fmtTarget).join('\n'));
    }

    if (rest === '清空') {
        await saveTargets([]);
        return s.reply('已清空全部巡检目标');
    }

    let m = rest.match(/^(添加|新增)\s+(\S+)\s+(https?:\/\/\S+)(?:\s+(\d{3}))?$/i);
    if (m) {
        const name = m[2];
        const url = m[3];
        const expectStatus = m[4] ? Number(m[4]) : 0;
        const list = await getTargets();
        const next = list.filter(t => t.name !== name);
        next.push({ name, url, expectStatus, fails: 0, checks: 0, last: null, createdAt: new Date().toISOString() });
        await saveTargets(next);
        return s.reply(`✅ 已添加巡检：${name}\n${url}${expectStatus ? '\n期望状态码：' + expectStatus : ''}`);
    }

    m = rest.match(/^(删除|移除)\s+(\S+)$/);
    if (m) {
        const list = await getTargets();
        const next = list.filter(t => t.name !== m[2]);
        if (next.length === list.length) return s.reply('没有找到这个巡检目标：' + m[2]);
        await saveTargets(next);
        return s.reply('🗑️ 已删除巡检：' + m[2]);
    }

    return s.reply('巡检用法：\n巡检\n巡检 列表\n巡检 添加 博客 https://example.com\n巡检 添加 接口 https://example.com/api 200\n巡检 删除 博客');
};
