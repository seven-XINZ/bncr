/**
 * @author xinz
 * @name 群治理
 * @team xinz
 * @description 群规、欢迎语、广告词提醒与活跃榜
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^群规(?:$|\s+[\s\S]+)$
 * @rule ^欢迎(?:$|\s+[\s\S]+)$
 * @rule ^广告词(?:$|\s+[\s\S]+)$
 * @rule ^活跃(?:$|\s+[\s\S]+)$
 * @rule ^限流(?:$|\s+[\s\S]+)$
 * @rule ^([\s\S]+)$
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
const NS = 'group_guard';

const jsonSchema = BncrCreateSchema.object({
    targets: BncrCreateSchema.string().setTitle('告警目标').setDescription('通知路由里的目标名，逗号分隔；留空走默认目标').setDefault(''),
    adWords: BncrCreateSchema.string().setTitle('默认广告词').setDescription('逗号分隔；也可以在群里用命令增删').setDefault('加微信,代理,刷单,博彩,贷款,返利'),
    cooldownMinutes: BncrCreateSchema.number().setTitle('同一用户告警冷却分钟').setDefault(10),
    limitPerMinute: BncrCreateSchema.number().setTitle('每人每分钟消息上限').setDescription('0 表示关闭；超过会提醒并告警').setDefault(15),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

link.register({
    name: '群治理',
    description: '群规/欢迎语/广告词/活跃榜',
    events: ['guard'],
    commands: ['群规', '群规 设置 内容', '欢迎 设置 内容', '广告词 添加 词', '活跃榜', '限流'],
});

function groupKey(s) {
    return String((typeof s.getGroupId === 'function' && s.getGroupId()) || 'private');
}
function userName(s) {
    return String((typeof s.getName === 'function' && s.getName()) || (typeof s.getUserId === 'function' && s.getUserId()) || '访客');
}
function targetsOf(cfg) {
    return String((cfg || {}).targets || '').split(/[,，\s]+/).map(x => x.trim()).filter(Boolean);
}
async function getData(s) {
    const all = await store.get(NS, 'groups', {});
    const key = groupKey(s);
    if (!all[key]) all[key] = { rules: '', welcome: '欢迎 {name} 加入本群，先看群规再发言。', adWords: [], activity: {}, lastWarn: {}, rate: {} };
    return { all, key, data: all[key] };
}
async function save(all) {
    return store.set(NS, 'groups', all);
}
function defaultAdWords(cfg) {
    return String(cfg.adWords || '').split(/[,，\s]+/).map(x => x.trim()).filter(Boolean);
}
function adHit(text, words) {
    const t = String(text || '').toLowerCase();
    return words.find(w => w && t.includes(w.toLowerCase()));
}
function isCommand(raw) {
    return /^(群规|欢迎|广告词|活跃|限流)(?:\s|$)/.test(raw);
}

module.exports = async s => {
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const raw = String(s.getMsg() || '').trim();
    const { all, key, data } = await getData(s);

    if (raw === '群规') {
        return s.reply(data.rules ? `📜 群规\n${data.rules}` : '还没有设置群规。\n群规 设置 内容');
    }
    let m = raw.match(/^群规\s+设置\s+([\s\S]+)$/);
    if (m) {
        data.rules = m[1].trim().slice(0, 1000);
        await save(all);
        return s.reply('✅ 群规已更新');
    }

    if (raw === '欢迎') {
        return s.reply('👋 欢迎语\n' + data.welcome.replace(/\{name\}/g, userName(s)));
    }
    m = raw.match(/^欢迎\s+设置\s+([\s\S]+)$/);
    if (m) {
        data.welcome = m[1].trim().slice(0, 500);
        await save(all);
        return s.reply('✅ 欢迎语已更新，可用 {name} 占位');
    }

    if (raw === '广告词') {
        const words = [...new Set([...defaultAdWords(cfg), ...(data.adWords || [])])];
        return s.reply('🚫 广告词\n' + (words.length ? words.map(x => '· ' + x).join('\n') : '暂无') + '\n\n广告词 添加 词 / 广告词 删除 词');
    }
    m = raw.match(/^广告词\s+添加\s+([\s\S]+)$/);
    if (m) {
        const words = m[1].split(/[,，\s]+/).map(x => x.trim()).filter(Boolean);
        data.adWords = [...new Set([...(data.adWords || []), ...words])];
        await save(all);
        return s.reply('✅ 已添加广告词：' + words.join('、'));
    }
    m = raw.match(/^广告词\s+删除\s+([\s\S]+)$/);
    if (m) {
        const words = m[1].split(/[,，\s]+/).map(x => x.trim()).filter(Boolean);
        data.adWords = (data.adWords || []).filter(x => !words.includes(x));
        await save(all);
        return s.reply('🗑️ 已删除广告词：' + words.join('、'));
    }

    if (raw === '活跃' || raw === '活跃榜') {
        const list = Object.entries(data.activity || {}).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 10);
        return s.reply('📊 群活跃榜\n' + (list.length ? list.map((x, i) => `${i + 1}. ${x.name}：${x.n} 条`).join('\n') : '暂无记录'));
    }

    if (raw === '限流') {
        const limit = Number(data.limit ?? cfg.limitPerMinute ?? 15);
        return s.reply(`🚦 群限流\n每人每分钟上限：${limit || '关闭'}\n当前窗口记录：${Object.keys(data.rate || {}).length} 人\n\n限流 设置 20（0 关闭）`);
    }
    m = raw.match(/^限流\s+设置\s+(\d+)$/);
    if (m) {
        data.limit = Math.max(0, Number(m[1]));
        await save(all);
        return s.reply(data.limit ? '✅ 已设置每人每分钟上限：' + data.limit : '✅ 已关闭群限流');
    }

    if (isCommand(raw)) return typeof s.next === 'function' ? s.next() : undefined;

    const user = userName(s);
    data.activity = data.activity || {};
    data.activity[user] = (Number(data.activity[user]) || 0) + 1;
    const limit = Number(data.limit ?? cfg.limitPerMinute ?? 15);
    const minute = Math.floor(Date.now() / 60000);
    data.rate = data.rate || {};
    const rec = data.rate[user] || { minute, count: 0, warned: 0 };
    if (rec.minute !== minute) {
        rec.minute = minute;
        rec.count = 0;
        rec.warned = 0;
    }
    rec.count = (Number(rec.count) || 0) + 1;
    data.rate[user] = rec;
    if (limit > 0 && rec.count > limit && rec.warned !== minute) {
        rec.warned = minute;
        link.alert(`🚦 发言过快\n群：${key}\n用户：${user}\n一分钟 ${rec.count} 条，上限 ${limit}`, targetsOf(cfg));
        await save(all);
        return s.reply(`🚦 ${user} 发言过快，已提醒管理员。`);
    }
    const words = [...new Set([...defaultAdWords(cfg), ...(data.adWords || [])])];
    const hit = adHit(raw, words);
    if (hit) {
        const now = Date.now();
        const last = Number((data.lastWarn || {})[user] || 0);
        const cooldown = (Number(cfg.cooldownMinutes) || 10) * 60000;
        data.lastWarn = data.lastWarn || {};
        if (now - last > cooldown) {
            data.lastWarn[user] = now;
            link.alert(`🚫 疑似广告\n群：${key}\n用户：${user}\n命中：${hit}\n内容：${raw.slice(0, 160)}`, targetsOf(cfg));
            await save(all);
            return s.reply(`⚠️ ${user} 的消息命中广告词「${hit}」，已记录并提醒管理员。`);
        }
    }
    await save(all);
    return typeof s.next === 'function' ? s.next() : undefined;
};
