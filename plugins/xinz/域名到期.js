/**
 * @author xinz
 * @name 域名到期
 * @team xinz
 * @version 1.0.0
 * @description 通过 RDAP 查询域名到期时间，30/7 天临期告警
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^域名$
 * @rule ^域名\s+列表$
 * @rule ^域名\s+添加\s+(\S+)\s+(\S+)$
 * @rule ^域名\s+删除\s+(\S+)$
 * @rule ^域名\s+清空$
 * @rule ^域名\s+(\S+)$
 * @admin true
 * @public true
 * @priority 1000000
 * @disable false
 * @cron 0 0 10 * * *
 * @classification ["工具"]
 */
'use strict';

const https = require('https');
const link = require('./mod/link');
const store = link.store;
const NS = 'domain';

const jsonSchema = BncrCreateSchema.object({
    targets: BncrCreateSchema.string().setTitle('推送目标').setDescription('通知路由里的目标名，逗号分隔；留空走默认目标').setDefault(''),
    warnDays: BncrCreateSchema.number().setTitle('提前多少天提醒').setDefault(30),
    timeout: BncrCreateSchema.number().setTitle('请求超时毫秒').setDefault(12000),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);
let running = false;

link.register({
    name: '域名到期',
    description: 'RDAP 域名到期查询与告警',
    events: ['domain'],
    commands: ['域名', '域名 列表', '域名 添加 名称 example.com', '域名 删除 名称'],
});

function requestJson(url, timeout, redirects = 5) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : require('http');
        const req = lib.get(parsed, { headers: { 'User-Agent': 'Bncr-DomainWatch/1.0', Accept: 'application/rdap+json, application/json' } }, res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
                res.resume();
                return resolve(requestJson(new URL(res.headers.location, parsed).toString(), timeout, redirects - 1));
            }
            if (res.statusCode >= 400) {
                res.resume();
                return reject(new Error('HTTP ' + res.statusCode));
            }
            let data = '';
            res.setEncoding('utf8');
            res.on('data', c => (data += c));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('返回不是 JSON'));
                }
            });
        });
        req.setTimeout(timeout, () => req.destroy(new Error('timeout')));
        req.on('error', reject);
    });
}

function normalizeDomain(input) {
    const raw = String(input || '').trim().toLowerCase();
    const host = raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].replace(/^www\./, '');
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : '';
}
function dateKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysUntil(dateText) {
    const t = new Date(dateText).getTime();
    if (!Number.isFinite(t)) return null;
    return Math.ceil((t - Date.now()) / 86400000);
}
function targetsOf(cfg, item) {
    const source = item && item.targets && item.targets.length ? item.targets : (cfg || {}).targets || '';
    return (Array.isArray(source) ? source.join(',') : String(source)).split(/[,，\s]+/).map(x => x.trim()).filter(Boolean);
}
function expirationOf(data) {
    const events = Array.isArray(data.events) ? data.events : [];
    const ev = events.find(x => /expiration/i.test(x.eventAction || '')) || events.find(x => /expiry/i.test(x.eventAction || ''));
    return ev ? ev.eventDate : '';
}
function registrarOf(data) {
    const entities = Array.isArray(data.entities) ? data.entities : [];
    const ent = entities.find(x => Array.isArray(x.roles) && x.roles.includes('registrar'));
    if (!ent) return '';
    const v = ent.vcardArray && ent.vcardArray[1];
    const fn = Array.isArray(v) ? v.find(x => x[0] === 'fn') : null;
    return fn ? String(fn[3] || '') : '';
}
async function fetchDomain(domain, timeout) {
    const data = await requestJson('https://rdap.org/domain/' + encodeURIComponent(domain), timeout);
    const expires = expirationOf(data);
    return {
        expires,
        days: daysUntil(expires),
        status: Array.isArray(data.status) ? data.status.slice(0, 6) : [],
        registrar: registrarOf(data),
    };
}
async function getItems() {
    const list = await store.get(NS, 'domains', []);
    return Array.isArray(list) ? list : [];
}
async function saveItems(list) {
    return store.set(NS, 'domains', list);
}
function fmt(item) {
    const last = item.last || {};
    if (last.error) return `🔴 ${item.name} · ${item.domain} · ${last.error}`;
    if (last.days === null || last.days === undefined) return `⚪ ${item.name} · ${item.domain}`;
    const icon = last.days <= 7 ? '🔴' : last.days <= 30 ? '🟡' : '🟢';
    return `${icon} ${item.name} · ${item.domain} · 剩余 ${last.days} 天 · ${last.expires || ''}`;
}
async function checkAll(silent) {
    if (running) return { count: 0, warn: 0, text: '上一轮检查还没结束' };
    running = true;
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const timeout = Number(cfg.timeout) || 12000;
    const warnDays = Number(cfg.warnDays) || 30;
    const items = await getItems();
    if (!items.length) {
        running = false;
        return { count: 0, warn: 0, text: '还没有域名。\n用法：域名 添加 博客 example.com' };
    }
    let warn = 0;
    for (const item of items) {
        try {
            const data = await fetchDomain(item.domain, timeout);
            item.last = Object.assign({}, data, { at: new Date().toISOString(), error: '' });
            item.lastError = '';
            if (data.days !== null && data.days <= warnDays) warn++;
            if (data.days !== null && data.days <= warnDays && item.lastAlertDay !== dateKey()) {
                const level = data.days <= 0 ? '已过期' : data.days <= 7 ? '紧急' : '即将到期';
                link.alert(`域名${level}：${item.name}\n${item.domain}\n剩余 ${data.days} 天，到期 ${data.expires}\n注册商：${data.registrar || '未知'}`, targetsOf(cfg, item));
                item.lastAlertDay = dateKey();
            }
        } catch (e) {
            item.last = { at: new Date().toISOString(), error: e.code || e.message };
            item.lastError = e.code || e.message;
        }
    }
    await saveItems(items);
    running = false;
    link.emit('domain', { count: items.length, warn });
    return { count: items.length, warn, text: `🌐 域名到期\n${items.map(fmt).join('\n')}\n\n共 ${items.length} 个，${warn} 个 ${warnDays} 天内到期` };
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    const isCron = typeof s.getFrom === 'function' && s.getFrom() === 'cron';
    await ConfigDB.get();
    if (isCron) {
        const result = await checkAll(true);
        console.info('[域名到期] 检查:', result.count, '个，临期', result.warn);
        return;
    }
    if (raw === '域名') return s.reply((await checkAll(false)).text);
    if (raw === '域名 列表' || raw === '域名列表') {
        const items = await getItems();
        if (!items.length) return s.reply('还没有域名。\n用法：域名 添加 博客 example.com');
        return s.reply('🌐 域名目标\n' + items.map(fmt).join('\n'));
    }
    let m = raw.match(/^域名\s+添加\s+(\S+)\s+(\S+)$/);
    if (m) {
        const domain = normalizeDomain(m[2]);
        if (!domain) return s.reply('域名格式不对，例如 example.com');
        const items = await getItems();
        if (items.some(x => x.domain === domain)) return s.reply('这个域名已经添加过了');
        try {
            const data = await fetchDomain(domain, Number((ConfigDB.userConfig || {}).timeout) || 12000);
            const item = { name: m[1], domain, targets: [], last: Object.assign({}, data, { at: new Date().toISOString(), error: '' }), lastAlertDay: '', createdAt: new Date().toISOString() };
            items.push(item);
            await saveItems(items);
            return s.reply(`✅ 已添加域名：${item.name}\n${domain}\n到期：${data.expires || '未知'}${data.days !== null ? `（剩余 ${data.days} 天）` : ''}`);
        } catch (e) {
            return s.reply('查询失败：' + (e.code || e.message));
        }
    }
    m = raw.match(/^域名\s+删除\s+(\S+)$/);
    if (m) {
        const items = await getItems();
        const next = items.filter(x => x.name !== m[1]);
        if (next.length === items.length) return s.reply('没有找到这个域名：' + m[1]);
        await saveItems(next);
        return s.reply('🗑️ 已删除域名：' + m[1]);
    }
    if (raw === '域名 清空') {
        await saveItems([]);
        return s.reply('已清空全部域名');
    }
    m = raw.match(/^域名\s+(\S+)$/);
    if (m && m[1] !== '列表') {
        const items = await getItems();
        const item = items.find(x => x.name === m[1]);
        if (!item) return s.reply('没有找到这个域名：' + m[1]);
        return s.reply(`🌐 ${item.name}\n${item.domain}\n到期：${(item.last || {}).expires || '未知'}\n剩余：${(item.last || {}).days ?? '未知'} 天\n注册商：${(item.last || {}).registrar || '未知'}`);
    }
    return s.reply('域名用法：\n域名\n域名 列表\n域名 添加 博客 example.com\n域名 删除 博客');
};
