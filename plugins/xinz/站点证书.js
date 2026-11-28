/**
 * @author xinz
 * @name 站点证书
 * @team xinz
 * @version 1.0.0
 * @description 检查 HTTPS 站点 TLS 证书剩余天数，临期或过期时通过通知路由告警
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^证书$
 * @rule ^证书\s+列表$
 * @rule ^证书\s+添加\s+(\S+)\s+(\S+)(?:\s+(\d+))?$
 * @rule ^证书\s+删除\s+(\S+)$
 * @rule ^证书\s+清空$
 * @admin true
 * @public true
 * @priority 1000000
 * @disable false
 * @cron 0 0 9 * * *
 * @classification ["工具"]
 */
'use strict';

const tls = require('tls');
const net = require('net');
const link = require('./mod/link');
const store = link.store;
const NS = 'cert';

const jsonSchema = BncrCreateSchema.object({
    targets: BncrCreateSchema.string()
        .setTitle('推送目标')
        .setDescription('通知路由里的目标名，逗号分隔；留空走默认目标')
        .setDefault(''),
    warnDays: BncrCreateSchema.number().setTitle('提前多少天提醒').setDefault(14),
    criticalDays: BncrCreateSchema.number().setTitle('紧急提醒天数').setDefault(7),
    timeout: BncrCreateSchema.number().setTitle('连接超时毫秒').setDefault(10000),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);
let running = false;

link.register({
    name: '站点证书',
    description: 'TLS 证书到期检查与告警',
    events: ['cert'],
    commands: ['证书', '证书 列表', '证书 添加 名称 域名 端口', '证书 删除 名称'],
});

function dateKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function targetList(cfg, item) {
    const source = item && item.targets && item.targets.length ? item.targets : (cfg || {}).targets || '';
    return (Array.isArray(source) ? source.join(',') : String(source))
        .split(/[,，\s]+/)
        .map(x => x.trim())
        .filter(Boolean);
}

function parseAddress(input) {
    const raw = String(input || '').trim();
    if (/^https?:\/\//i.test(raw)) {
        try {
            const u = new URL(raw);
            return { host: u.hostname, port: Number(u.port) || 443 };
        } catch (e) {
            return null;
        }
    }
    const m = raw.match(/^([^:]+)(?::(\d+))?$/);
    if (!m) return null;
    return { host: m[1], port: Number(m[2]) || 443 };
}

function checkOne(host, port, timeout) {
    return new Promise((resolve, reject) => {
        let done = false;
        let socket;
        const finish = (err, data) => {
            if (done) return;
            done = true;
            if (socket) socket.destroy();
            if (err) reject(err);
            else resolve(data);
        };
        const servername = net.isIP(host) ? undefined : host;
        socket = tls.connect(
            { host, port, ...(servername ? { servername } : {}), rejectUnauthorized: false, timeout },
            () => {
                try {
                    const cert = socket.getPeerCertificate();
                    if (!cert || !cert.valid_to) return finish(new Error('没有读取到证书'));
                    const expires = new Date(cert.valid_to).getTime();
                    if (!Number.isFinite(expires)) return finish(new Error('证书到期时间无法解析'));
                    const days = Math.ceil((expires - Date.now()) / 86400000);
                    finish(null, {
                        days,
                        validTo: cert.valid_to,
                        issuer: (cert.issuer && (cert.issuer.CN || cert.issuer.O)) || '',
                    });
                } catch (e) {
                    finish(e);
                }
            }
        );
        socket.setTimeout(timeout, () => finish(new Error('timeout')));
        socket.on('error', e => finish(e));
    });
}

async function getCerts() {
    const list = await store.get(NS, 'certs', []);
    return Array.isArray(list) ? list : [];
}
async function saveCerts(list) {
    return store.set(NS, 'certs', list);
}

function fmtCert(item) {
    const last = item.last || {};
    if (!last.at) return `⚪ ${item.name} · ${item.host}:${item.port} · 未检查`;
    if (last.error) return `🔴 ${item.name} · ${item.host}:${item.port} · ${last.error}`;
    const days = Number(last.days);
    const icon = days <= 0 ? '⛔' : days <= 7 ? '🔴' : days <= 14 ? '🟡' : '🟢';
    return `${icon} ${item.name} · ${item.host}:${item.port} · 剩余 ${days} 天 · ${last.validTo || ''}`;
}

async function checkAll(silent) {
    if (running) return { count: 0, expiring: 0, text: '上一轮检查还没结束' };
    running = true;
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const timeout = Number(cfg.timeout) || 10000;
    const warnDays = Number(cfg.warnDays) || 14;
    const criticalDays = Number(cfg.criticalDays) || 7;
    const certs = await getCerts();
    if (!certs.length) {
        running = false;
        return { count: 0, expiring: 0, text: '还没有证书目标。\n用法：证书 添加 博客 https://example.com' };
    }

    let expiring = 0;
    for (const item of certs) {
        try {
            const data = await checkOne(item.host, item.port, timeout);
            item.last = Object.assign({}, data, { at: new Date().toISOString(), error: '' });
            item.lastError = '';
            if (data.days <= warnDays) expiring++;
            if (data.days <= warnDays && item.lastAlertDay !== dateKey()) {
                const level = data.days <= 0 ? '已过期' : data.days <= criticalDays ? '紧急' : '即将到期';
                link.alert(
                    `证书${level}：${item.name}\n${item.host}:${item.port}\n剩余 ${data.days} 天，到期时间 ${data.validTo}`,
                    targetList(cfg, item)
                );
                item.lastAlertDay = dateKey();
            } else if (data.days > warnDays) {
                item.lastAlertDay = '';
            }
        } catch (e) {
            item.last = { at: new Date().toISOString(), error: e.code || e.message };
            item.lastError = e.code || e.message;
        }
    }
    await saveCerts(certs);
    running = false;
    link.emit('cert', { count: certs.length, expiring });
    return {
        count: certs.length,
        expiring,
        text: `🔐 站点证书\n${certs.map(fmtCert).join('\n')}\n\n共 ${certs.length} 个，${expiring} 个 ${warnDays} 天内到期`,
    };
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    const isCron = typeof s.getFrom === 'function' && s.getFrom() === 'cron';
    await ConfigDB.get();

    if (isCron) {
        const result = await checkAll(true);
        console.info('[站点证书] 定时检查:', result.count, '个证书，临期', result.expiring);
        return;
    }

    if (raw === '证书') {
        const result = await checkAll(false);
        return s.reply(result.text);
    }

    if (raw === '证书 列表' || raw === '证书列表') {
        const certs = await getCerts();
        if (!certs.length) return s.reply('还没有证书目标。\n用法：证书 添加 博客 https://example.com');
        return s.reply('🔐 证书目标\n' + certs.map(fmtCert).join('\n'));
    }

    let m = raw.match(/^证书\s+添加\s+(\S+)\s+(\S+)(?:\s+(\d+))?$/);
    if (m) {
        const name = m[1];
        const address = parseAddress(m[2]);
        if (!address) return s.reply('域名格式不对，例如：证书 添加 博客 https://example.com');
        const port = Number(m[3]) || address.port || 443;
        const certs = await getCerts();
        const next = certs.filter(x => x.name !== name);
        const item = { name, host: address.host, port, targets: [], last: null, lastAlertDay: '', createdAt: new Date().toISOString() };
        try {
            const data = await checkOne(item.host, item.port, Number((ConfigDB.userConfig || {}).timeout) || 10000);
            item.last = Object.assign({}, data, { at: new Date().toISOString(), error: '' });
            next.push(item);
            await saveCerts(next);
            return s.reply(`✅ 已添加证书目标：${name}\n${item.host}:${item.port}\n剩余 ${data.days} 天，到期 ${data.validTo}`);
        } catch (e) {
            return s.reply(`证书检查失败：${e.code || e.message}\n确认域名和端口可访问后再添加。`);
        }
    }

    m = raw.match(/^证书\s+删除\s+(\S+)$/);
    if (m) {
        const certs = await getCerts();
        const next = certs.filter(x => x.name !== m[1]);
        if (next.length === certs.length) return s.reply('没有找到这个证书目标：' + m[1]);
        await saveCerts(next);
        return s.reply('🗑️ 已删除证书目标：' + m[1]);
    }

    if (raw === '证书 清空') {
        await saveCerts([]);
        return s.reply('已清空全部证书目标');
    }

    return s.reply('证书用法：\n证书\n证书 列表\n证书 添加 博客 https://example.com\n证书 添加 接口 example.com 443\n证书 删除 博客');
};
