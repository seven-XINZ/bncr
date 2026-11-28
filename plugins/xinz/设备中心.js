/**
 * @author xinz
 * @name 设备中心
 * @team xinz
 * @version 1.0.0
 * @description 设备与场景入口：MQTT 开关、HomeAssistant 状态/场景
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^设备$
 * @rule ^设备\s+列表$
 * @rule ^设备\s+添加\s+(\S+)\s+(\S+)(?:\s+(\S+)\s+(\S+))?$
 * @rule ^设备\s+删除\s+(\S+)$
 * @rule ^设备\s+开关\s+(\S+)\s+(开|关|on|off|toggle|切换)$
 * @rule ^设备\s+状态\s+(\S+)$
 * @rule ^设备\s+场景\s+(\S+)$
 * @rule ^设备\s+场景\s+添加\s+(\S+)\s+(\S+)$
 * @rule ^Frigate$
 * @rule ^Frigate\s+事件$
 * @admin true
 * @public true
 * @priority 1000000
 * @disable false
 * @classification ["工具"]
 */
'use strict';

const http = require('http');
const https = require('https');
const link = require('./mod/link');
const store = link.store;
const NS = 'device';

const jsonSchema = BncrCreateSchema.object({
    mqttUrl: BncrCreateSchema.string().setTitle('MQTT 地址').setDescription('例如 mqtt://127.0.0.1:1883，留空不启用 MQTT').setDefault(''),
    mqttUser: BncrCreateSchema.string().setTitle('MQTT 用户名').setDefault(''),
    mqttPass: BncrCreateSchema.string().setTitle('MQTT 密码').setDefault(''),
    haUrl: BncrCreateSchema.string().setTitle('HomeAssistant 地址').setDescription('例如 http://127.0.0.1:8123').setDefault(''),
    haToken: BncrCreateSchema.string().setTitle('HomeAssistant Token').setDefault(''),
    frigateUrl: BncrCreateSchema.string().setTitle('Frigate 地址').setDescription('例如 http://127.0.0.1:5000，留空不启用').setDefault(''),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

link.register({
    name: '设备中心',
    description: 'MQTT 设备与 HomeAssistant 场景控制',
    events: ['device'],
    commands: ['设备 列表', '设备 添加 名称 topic ON OFF', '设备 开关 名称 开', '设备 状态 实体ID', '设备 场景 名称', 'Frigate 事件'],
});

function requestJson(url, options = {}, timeout = 10000) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (e) {
            return reject(new Error('地址不合法'));
        }
        const lib = parsed.protocol === 'https:' ? https : http;
        const opt = {
            method: options.method || 'GET',
            headers: Object.assign({ Accept: 'application/json', 'Content-Type': 'application/json' }, options.headers || {}),
        };
        const req = lib.request(parsed, opt, res => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', c => (data += c));
            res.on('end', () => {
                if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode + ' ' + data.slice(0, 100)));
                if (!data.trim()) return resolve({});
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('返回不是 JSON'));
                }
            });
        });
        req.setTimeout(timeout, () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        if (options.body) req.write(JSON.stringify(options.body));
        req.end();
    });
}

async function getDevices() {
    const list = await store.get(NS, 'devices', []);
    return Array.isArray(list) ? list : [];
}
async function saveDevices(list) {
    return store.set(NS, 'devices', list);
}
async function getScenes() {
    const list = await store.get(NS, 'scenes', []);
    return Array.isArray(list) ? list : [];
}

function mqttPublish(cfg, topic, payload) {
    return new Promise((resolve, reject) => {
        let mqtt;
        try {
            mqtt = require('mqtt');
        } catch (e) {
            return reject(new Error('未安装 mqtt 模块，请在 Bncr 运行环境安装 mqtt'));
        }
        if (!cfg.mqttUrl) return reject(new Error('未配置 MQTT 地址'));
        const client = mqtt.connect(cfg.mqttUrl, {
            username: cfg.mqttUser || undefined,
            password: cfg.mqttPass || undefined,
            connectTimeout: 6000,
            reconnectPeriod: 0,
        });
        let done = false;
        const finish = (err, data) => {
            if (done) return;
            done = true;
            try {
                client.end(true);
            } catch (e) {}
            if (err) reject(err);
            else resolve(data);
        };
        client.on('connect', () => {
            client.publish(topic, payload, { qos: 0 }, err => finish(err));
        });
        client.on('error', err => finish(err));
        setTimeout(() => finish(new Error('MQTT 连接超时')), 8000);
    });
}

function haHeaders(cfg) {
    return { Authorization: 'Bearer ' + cfg.haToken };
}
async function haState(cfg, entity) {
    if (!cfg.haUrl || !cfg.haToken) throw new Error('未配置 HomeAssistant 地址或 Token');
    return requestJson(`${cfg.haUrl.replace(/\/$/, '')}/api/states/${encodeURIComponent(entity)}`, { headers: haHeaders(cfg) });
}
async function haScene(cfg, entity) {
    if (!cfg.haUrl || !cfg.haToken) throw new Error('未配置 HomeAssistant 地址或 Token');
    return requestJson(`${cfg.haUrl.replace(/\/$/, '')}/api/services/scene/turn_on`, {
        method: 'POST',
        headers: haHeaders(cfg),
        body: { entity_id: entity },
    });
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const devices = await getDevices();
    const scenes = await getScenes();

    if (raw === '设备') {
        return s.reply('设备中心用法：\n设备 列表\n设备 添加 客厅灯 home/living/light ON OFF\n设备 开关 客厅灯 开\n设备 状态 light.living_room\n设备 场景 回家\nFrigate 事件');
    }

    if (raw === 'Frigate' || raw === 'Frigate 事件') {
        if (!cfg.frigateUrl) return s.reply('未配置 Frigate 地址');
        try {
            const data = await requestJson(cfg.frigateUrl.replace(/\/$/, '') + '/api/events?limit=10&include_thumbnails=0', {}, Number(cfg.timeout) || 10000);
            const list = Array.isArray(data) ? data : [];
            const lines = list.map(x => `· ${x.camera || '未知'} · ${x.label || '对象'} · ${String(x.start_time || '').slice(0, 16).replace('T', ' ')}${x.has_clip ? ' · 有录像' : ''}`);
            return s.reply('🎥 Frigate 事件\n' + (lines.length ? lines.join('\n') : '暂无事件'));
        } catch (e) {
            return s.reply('Frigate 查询失败：' + e.message);
        }
    }

    if (raw === '设备 列表') {
        const lines = devices.map(d => `· ${d.name} → ${d.topic}（开:${d.on} 关:${d.off}）`);
        const sl = scenes.map(x => `· ${x.name} → ${x.entity}`);
        return s.reply(`🔌 设备\n${lines.join('\n') || '暂无 MQTT 设备'}\n\n🏠 HA 场景\n${sl.join('\n') || '暂无场景'}\n\n添加场景：设备 场景 添加 名称 entity_id`);
    }

    let m = raw.match(/^设备\s+添加\s+(\S+)\s+(\S+)(?:\s+(\S+)\s+(\S+))?$/);
    if (m) {
        const name = m[1];
        const topic = m[2];
        const item = { name, topic, on: m[3] || 'ON', off: m[4] || 'OFF' };
        const next = devices.filter(x => x.name !== name);
        next.push(item);
        await saveDevices(next);
        return s.reply(`✅ 已添加设备：${name}\n${topic}\n开=${item.on}，关=${item.off}`);
    }

    m = raw.match(/^设备\s+删除\s+(\S+)$/);
    if (m) {
        const next = devices.filter(x => x.name !== m[1]);
        if (next.length === devices.length) return s.reply('没有找到这个设备：' + m[1]);
        await saveDevices(next);
        return s.reply('🗑️ 已删除设备：' + m[1]);
    }

    m = raw.match(/^设备\s+开关\s+(\S+)\s+(开|关|on|off|toggle|切换)$/i);
    if (m) {
        const item = devices.find(x => x.name === m[1]);
        if (!item) return s.reply('没有找到这个设备：' + m[1]);
        const act = m[2];
        const targetOn = /开|on/i.test(act) ? true : /关|off/i.test(act) ? false : item.state !== 'on';
        const payload = targetOn ? item.on : item.off;
        try {
            await mqttPublish(cfg, item.topic, payload);
            item.state = targetOn ? 'on' : 'off';
            await saveDevices(devices);
            link.emit('device', { name: item.name, topic: item.topic, payload });
            return s.reply(`🔌 已发送：${item.name} → ${payload}`);
        } catch (e) {
            return s.reply('MQTT 发送失败：' + e.message);
        }
    }

    m = raw.match(/^设备\s+状态\s+(\S+)$/);
    if (m) {
        try {
            const data = await haState(cfg, m[1]);
            return s.reply(`🏠 ${data.attributes && data.attributes.friendly_name ? data.attributes.friendly_name : m[1]}\n状态：${data.state}\n更新时间：${data.last_updated || '未知'}`);
        } catch (e) {
            return s.reply('查询失败：' + e.message);
        }
    }

    m = raw.match(/^设备\s+场景\s+添加\s+(\S+)\s+(\S+)$/);
    if (m) {
        const next = scenes.filter(x => x.name !== m[1]);
        next.push({ name: m[1], entity: m[2] });
        await store.set(NS, 'scenes', next);
        return s.reply('✅ 已添加场景：' + m[1] + ' → ' + m[2]);
    }

    m = raw.match(/^设备\s+场景\s+(\S+)$/);
    if (m) {
        const item = scenes.find(x => x.name === m[1]);
        const entity = item ? item.entity : m[1].startsWith('scene.') ? m[1] : 'scene.' + m[1];
        try {
            await haScene(cfg, entity);
            link.emit('device', { scene: item ? item.name : entity });
            return s.reply('🏠 已触发场景：' + (item ? item.name : entity));
        } catch (e) {
            return s.reply('场景触发失败：' + e.message);
        }
    }

    return s.reply('设备中心用法：\n设备 列表\n设备 添加 客厅灯 home/living/light ON OFF\n设备 开关 客厅灯 开\n设备 状态 light.living_room\n设备 场景 回家');
};
