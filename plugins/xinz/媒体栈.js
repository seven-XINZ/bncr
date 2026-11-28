/**
 * @author xinz
 * @name 媒体栈
 * @team xinz
 * @version 1.0.0
 * @description 查询 Emby 服务状态、最近入库、正在播放与会话
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^媒体$
 * @rule ^媒体\s+最近$
 * @rule ^媒体\s+会话$
 * @rule ^媒体\s+搜索\s+([\s\S]+)$
 * @admin false
 * @public true
 * @priority 1000000
 * @disable false
 * @classification ["媒体"]
 */
'use strict';

const http = require('http');
const https = require('https');
const link = require('./mod/link');

const jsonSchema = BncrCreateSchema.object({
    embyUrl: BncrCreateSchema.string().setTitle('Emby 地址').setDescription('例如 http://127.0.0.1:8096').setDefault(''),
    embyApiKey: BncrCreateSchema.string().setTitle('Emby API Key').setDefault(''),
    timeout: BncrCreateSchema.number().setTitle('请求超时毫秒').setDefault(10000),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

link.register({
    name: '媒体栈',
    description: 'Emby 状态、最近入库、会话与搜索',
    events: ['media'],
    commands: ['媒体', '媒体 最近', '媒体 会话', '媒体 搜索 关键词'],
});

function requestJson(url, cfg) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = lib.get(
            parsed,
            {
                headers: {
                    Accept: 'application/json',
                    'X-Emby-Token': cfg.embyApiKey || '',
                },
            },
            res => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', c => (data += c));
                res.on('end', () => {
                    if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode));
                    try {
                        resolve(JSON.parse(data || '{}'));
                    } catch (e) {
                        reject(new Error('返回不是 JSON'));
                    }
                });
            }
        );
        req.setTimeout(Number(cfg.timeout) || 10000, () => req.destroy(new Error('timeout')));
        req.on('error', reject);
    });
}
function base(cfg) {
    if (!cfg.embyUrl) throw new Error('未配置 Emby 地址');
    const u = cfg.embyUrl.replace(/\/$/, '');
    return /^https?:\/\//.test(u) ? u : 'http://' + u;
}
function q(cfg, path) {
    return requestJson(base(cfg) + path, cfg);
}
function itemName(x) {
    if (!x) return '未知';
    if (x.SeriesName) return `${x.SeriesName} · ${x.Name || ''}`;
    return x.Name || x.Path || '未知';
}
function time(ticks) {
    const sec = Math.floor(Number(ticks || 0) / 10000000);
    if (!sec) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
async function recent(cfg, limit = 8) {
    const data = await q(cfg, `/emby/Items/RecentlyAdded?Limit=${limit}&Recursive=true&IncludeItemTypes=Movie,Episode&Fields=Name,SeriesName,ProductionYear,RunTimeTicks`);
    return (data.Items || []).map(x => itemName(x) + (x.ProductionYear ? `（${x.ProductionYear}）` : ''));
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    if (raw === '媒体') {
        try {
            const [info, sessions, rec] = await Promise.all([
                q(cfg, '/emby/System/Info'),
                q(cfg, '/emby/Sessions'),
                recent(cfg, 5),
            ]);
            const playing = (sessions || []).filter(x => x.NowPlayingItem);
            const lines = [
                `🎬 ${info.ServerName || 'Emby'} ${info.Version || ''}`.trim(),
                `正在播放：${playing.length} 个会话`,
            ];
            if (playing.length) {
                for (const x of playing.slice(0, 5)) {
                    const p = x.PlayState || {};
                    lines.push(`· ${x.UserName || '用户'}：${itemName(x.NowPlayingItem)}${p.PositionTicks ? ` ${time(p.PositionTicks)}` : ''}`);
                }
            }
            lines.push('最近入库：');
            lines.push(rec.length ? rec.map(x => '· ' + x).join('\n') : '· 暂无');
            return s.reply(lines.join('\n'));
        } catch (e) {
            return s.reply('媒体查询失败：' + e.message + '\n请检查插件配置 embyUrl / embyApiKey。');
        }
    }
    if (raw === '媒体 最近') {
        try {
            const list = await recent(cfg, 10);
            return s.reply('🎬 最近入库\n' + (list.length ? list.map(x => '· ' + x).join('\n') : '暂无'));
        } catch (e) {
            return s.reply('查询失败：' + e.message);
        }
    }
    if (raw === '媒体 会话') {
        try {
            const sessions = await q(cfg, '/emby/Sessions');
            const lines = (sessions || []).map(x => {
                const p = x.PlayState || {};
                return `· ${x.UserName || '用户'} · ${x.DeviceName || '设备'}：${x.NowPlayingItem ? itemName(x.NowPlayingItem) + ' ' + (p.PositionTicks ? time(p.PositionTicks) : '') : '空闲'}`;
            });
            return s.reply('📺 会话\n' + (lines.length ? lines.join('\n') : '暂无会话'));
        } catch (e) {
            return s.reply('查询失败：' + e.message);
        }
    }
    const m = raw.match(/^媒体\s+搜索\s+([\s\S]+)$/);
    if (m) {
        try {
            const data = await q(cfg, `/emby/Items?SearchTerm=${encodeURIComponent(m[1].trim())}&Recursive=true&IncludeItemTypes=Movie,Series&Limit=10&Fields=Name,SeriesName,ProductionYear`);
            const list = (data.Items || []).map(x => '· ' + itemName(x) + (x.ProductionYear ? `（${x.ProductionYear}）` : ''));
            return s.reply('🔎 媒体搜索\n' + (list.length ? list.join('\n') : '没有结果'));
        } catch (e) {
            return s.reply('搜索失败：' + e.message);
        }
    }
    return s.reply('媒体栈用法：\n媒体\n媒体 最近\n媒体 会话\n媒体 搜索 关键词');
};
