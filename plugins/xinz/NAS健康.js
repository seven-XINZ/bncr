/**
 * @author xinz
 * @name NAS健康
 * @team xinz
 * @version 1.0.0
 * @description 本机磁盘、SMART、UPS、备份时效巡检
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^NAS$
 * @rule ^NAS\s+硬盘$
 * @rule ^NAS\s+UPS$
 * @rule ^NAS\s+备份$
 * @admin true
 * @public true
 * @priority 1000000
 * @disable false
 * @cron 0 30 8 * * *
 * @classification ["运维"]
 */
'use strict';

const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const link = require('./mod/link');
const store = link.store;
const NS = 'nas';

const jsonSchema = BncrCreateSchema.object({
    targets: BncrCreateSchema.string().setTitle('推送目标').setDescription('通知路由里的目标名，逗号分隔；留空走默认目标').setDefault(''),
    smartDevices: BncrCreateSchema.string().setTitle('SMART 设备').setDescription('逗号分隔，例如 /dev/sda,/dev/sdb；留空跳过').setDefault(''),
    upsName: BncrCreateSchema.string().setTitle('UPS 名称').setDescription('upsc 的名称，留空跳过').setDefault(''),
    backupPath: BncrCreateSchema.string().setTitle('备份文件路径').setDescription('检查最后修改时间，留空跳过').setDefault(''),
    backupMaxHours: BncrCreateSchema.number().setTitle('备份最大间隔小时').setDefault(26),
    diskWarnPercent: BncrCreateSchema.number().setTitle('磁盘使用率告警阈值').setDefault(90),
    timeout: BncrCreateSchema.number().setTitle('命令超时毫秒').setDefault(10000),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);
let running = false;

link.register({
    name: 'NAS健康',
    description: 'NAS 磁盘、SMART、UPS、备份时效检查',
    events: ['nas'],
    commands: ['NAS', 'NAS 硬盘', 'NAS UPS', 'NAS 备份'],
});

function run(cmd, args, timeout) {
    return new Promise(resolve => {
        execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            resolve({ code: err ? (err.code || 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), error: err ? err.message : '' });
        });
    });
}
function day() {
    return new Date().toISOString().slice(0, 10);
}
function targetsOf(cfg) {
    return String((cfg || {}).targets || '').split(/[,，\s]+/).map(x => x.trim()).filter(Boolean);
}
function fmtBytes(n) {
    const b = Number(n) || 0;
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = b;
    while (v >= 1024 && i < u.length - 1) {
        v /= 1024;
        i++;
    }
    return v.toFixed(v >= 10 ? 0 : 1) + u[i];
}
async function diskInfo(timeout) {
    const out = await run('df', ['-P', '/'], timeout);
    if (out.code !== 0) return { error: out.error || out.stderr.trim() || 'df 失败' };
    const lines = out.stdout.trim().split('\n');
    const last = lines[lines.length - 1].trim();
    const m = last.match(/^(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+(.+)$/);
    if (!m) return { error: '无法解析 df 输出' };
    return { fs: m[1], total: Number(m[2]), used: Number(m[3]), free: Number(m[4]), percent: Number(m[5]), mount: m[6] };
}
function parseTemp(text) {
    const m = text.match(/(?:Temperature_Celsius|Airflow_Temperature_Cel|Current Temperature):\s*(\d+)/i);
    return m ? Number(m[1]) : null;
}
async function smartInfo(dev, timeout) {
    const health = await run('smartctl', ['-H', dev], timeout);
    if (health.code !== 0 && !health.stdout && !health.stderr) return { device: dev, error: 'smartctl 不可用' };
    const text = (health.stdout || '') + '\n' + (health.stderr || '');
    if (/Command not found|not found/i.test(text)) return { device: dev, error: '未安装 smartctl' };
    const failed = /FAILED|FAILURE|failing_now|FAIL/i.test(text) && !/PASSED|OK/i.test(text);
    const attrs = await run('smartctl', ['-A', dev], timeout);
    const temp = parseTemp((attrs.stdout || '') + '\n' + (attrs.stderr || ''));
    return {
        device: dev,
        health: failed ? 'FAILED' : /PASSED|OK/i.test(text) ? 'PASSED' : 'UNKNOWN',
        temp,
        error: '',
    };
}
async function upsInfo(name, timeout) {
    if (!name) return { skipped: true };
    const out = await run('upsc', [name], timeout);
    if (out.code !== 0) return { error: out.error || out.stderr.trim() || 'upsc 失败' };
    const map = {};
    out.stdout.split('\n').forEach(line => {
        const i = line.indexOf(':');
        if (i > 0) map[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    return {
        name,
        status: map['ups.status'] || 'UNKNOWN',
        charge: map['battery.charge'] || '',
        load: map['ups.load'] || '',
        runtime: map['battery.runtime'] || '',
        error: '',
    };
}
async function backupInfo(path, maxHours) {
    if (!path) return { skipped: true };
    try {
        const st = fs.statSync(path);
        const age = (Date.now() - st.mtimeMs) / 3600000;
        return { path, mtime: st.mtime.toISOString(), ageHours: age, stale: age > maxHours };
    } catch (e) {
        return { path, error: e.code || e.message };
    }
}
function statusIcon(ok) {
    return ok ? '🟢' : '🔴';
}
async function inspect(cfg) {
    const timeout = Number(cfg.timeout) || 10000;
    const devices = String(cfg.smartDevices || '').split(/[,，\s]+/).map(x => x.trim()).filter(x => /^\/dev\/[a-z0-9]+$/.test(x));
    const disk = await diskInfo(timeout);
    const smart = [];
    for (const dev of devices) smart.push(await smartInfo(dev, timeout));
    const ups = await upsInfo(cfg.upsName, timeout);
    const backup = await backupInfo(cfg.backupPath, Number(cfg.backupMaxHours) || 26);
    return { disk, smart, ups, backup, at: new Date().toISOString() };
}
function summary(data, cfg) {
    const parts = ['💾 NAS 健康'];
    if (data.disk.error) parts.push('磁盘：' + data.disk.error);
    else parts.push(`磁盘：${data.disk.percent}% 已用，剩余 ${fmtBytes(data.disk.free)} / ${fmtBytes(data.disk.total)}`);
    if (data.smart.length) {
        parts.push('SMART：' + data.smart.map(x => `${x.device} ${x.error || x.health}${x.temp != null ? ` ${x.temp}℃` : ''}`).join(' | '));
    }
    if (!data.ups.skipped) parts.push('UPS：' + (data.ups.error || `${data.ups.status}，电量 ${data.ups.charge || '?'}%`));
    if (!data.backup.skipped) parts.push('备份：' + (data.backup.error || `${data.backup.ageHours.toFixed(1)} 小时前${data.backup.stale ? '（已过期）' : ''}`));
    parts.push('负载：' + os.loadavg().map(x => x.toFixed(2)).join(' / '));
    return parts.join('\n');
}
async function checkAll(cfg, silent) {
    if (running) return { text: '上一轮检查还没结束', alerts: 0 };
    running = true;
    const data = await inspect(cfg);
    const alerts = [];
    if (!data.disk.error && data.disk.percent >= (Number(cfg.diskWarnPercent) || 90)) alerts.push(`磁盘使用率 ${data.disk.percent}%`);
    for (const x of data.smart) if (!x.error && x.health === 'FAILED') alerts.push(`${x.device} SMART 失败`);
    if (!data.ups.skipped && !data.ups.error && /OB|LB|RB/i.test(data.ups.status)) alerts.push(`UPS ${data.ups.status}`);
    if (!data.backup.skipped && !data.backup.error && data.backup.stale) alerts.push(`备份已 ${data.backup.ageHours.toFixed(1)} 小时未更新`);
    const state = await store.get(NS, 'state', {});
    if (alerts.length) {
        const dayKey = day();
        if (state.lastAlertDay !== dayKey) {
            link.alert('⚠️ NAS 健康告警\n' + alerts.join('\n') + '\n\n' + summary(data, cfg), targetsOf(cfg));
            state.lastAlertDay = dayKey;
        }
    } else {
        state.lastAlertDay = '';
    }
    state.last = data;
    state.at = data.at;
    await store.set(NS, 'state', state);
    running = false;
    link.emit('nas', { alerts: alerts.length, disk: data.disk.percent });
    return { data, alerts: alerts.length, text: summary(data, cfg) + (alerts.length ? '\n\n⚠️ ' + alerts.join('；') : '') };
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    const isCron = typeof s.getFrom === 'function' && s.getFrom() === 'cron';
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    if (isCron) {
        const result = await checkAll(cfg, true);
        console.info('[NAS健康] 巡检:', result.alerts, '个告警');
        return;
    }
    if (raw === 'NAS') {
        const result = await checkAll(cfg, false);
        return s.reply(result.text);
    }
    if (raw === 'NAS 硬盘') {
        const data = await inspect(cfg);
        if (!data.smart.length) return s.reply('未配置 SMART 设备。在插件配置里填 smartDevices，例如 /dev/sda,/dev/sdb。');
        return s.reply('💽 SMART\n' + data.smart.map(x => `${x.device}：${x.error || x.health}${x.temp != null ? `，${x.temp}℃` : ''}`).join('\n'));
    }
    if (raw === 'NAS UPS') {
        const ups = await upsInfo(cfg.upsName, Number(cfg.timeout) || 10000);
        if (ups.skipped) return s.reply('未配置 UPS 名称。在插件配置里填 upsName。');
        if (ups.error) return s.reply('UPS 查询失败：' + ups.error);
        return s.reply(`🔋 ${ups.name}\n状态：${ups.status}\n电量：${ups.charge}%\n负载：${ups.load}%\n续航：${ups.runtime} 秒`);
    }
    if (raw === 'NAS 备份') {
        const backup = await backupInfo(cfg.backupPath, Number(cfg.backupMaxHours) || 26);
        if (backup.skipped) return s.reply('未配置备份路径。在插件配置里填 backupPath。');
        if (backup.error) return s.reply('备份检查失败：' + backup.error);
        return s.reply(`📦 备份\n${backup.path}\n最近：${backup.mtime}\n距今：${backup.ageHours.toFixed(1)} 小时${backup.stale ? '（已超过阈值）' : ''}`);
    }
    return s.reply('NAS 健康用法：\nNAS\nNAS 硬盘\nNAS UPS\nNAS 备份');
};
