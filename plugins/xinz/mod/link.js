/**
 * mod/link.js —— 插件联动总线
 * 提供三件事：插件目录扫描、跨插件调用、事件广播。
 * 纯 Node 内置模块 + mod/store，不依赖面板，也不改 Bncr 内核。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const store = require('./store');

const PLUGIN_ROOT = path.join(__dirname, '..', '..'); // plugins/
const bus = global.__BNCR_LINK_BUS__ || (global.__BNCR_LINK_BUS__ = new EventEmitter());
bus.setMaxListeners(80);
const registry = global.__BNCR_LINK_REGISTRY__ || (global.__BNCR_LINK_REGISTRY__ = new Map());
let scanCache = { sig: '', at: 0, list: [] };

function stripRule(raw) {
    return String(raw || '')
        .replace(/^`+|`+$/g, '')
        .replace(/\s*\*\/.*$/, '')
        .trim();
}

function parseMeta(file, code) {
    const pick = key => {
        const m = code.match(new RegExp('@' + key + '\\s+([^\\n\\r]+)'));
        return m ? String(m[1]).replace(/\s*\*\/.*$/, '').trim() : '';
    };
    const name = pick('name');
    if (!name) return null;
    const rules = [];
    for (const line of code.split(/\r?\n/)) {
        const m = line.match(/@(?:rule|cron)\s+([^\n\r]+)/);
        if (m) rules.push(stripRule(m[1]));
    }
    return {
        name,
        version: pick('version') || '0.0.0',
        author: pick('author') || 'unknown',
        team: pick('team') || '',
        description: pick('description') || '',
        rules,
        admin: pick('admin') === 'true',
        public: pick('public') === 'true',
        service: pick('service') === 'true',
        cron: (code.match(/@cron\s+([^\n\r]+)/) || [])[1] || '',
        file,
        abs: path.resolve(PLUGIN_ROOT, file),
        kind: 'plugin',
    };
}

function walk(dir, out) {
    let names;
    try {
        names = fs.readdirSync(dir);
    } catch (e) {
        return out;
    }
    for (const name of names) {
        if (name === 'node_modules' || name === '.git' || name === 'data') continue;
        const full = path.join(dir, name);
        let st;
        try {
            st = fs.statSync(full);
        } catch (e) {
            continue;
        }
        if (st.isDirectory()) walk(full, out);
        else if (name.endsWith('.js')) out.push(full);
    }
    return out;
}

function signature(files) {
    return files
        .map(f => {
            try {
                const st = fs.statSync(f);
                return f + ':' + st.size + ':' + st.mtimeMs;
            } catch (e) {
                return f + ':0';
            }
        })
        .join('|');
}

function scan(force) {
    const files = walk(PLUGIN_ROOT, []).sort();
    const sig = signature(files);
    if (!force && sig === scanCache.sig && Date.now() - scanCache.at < 5000) return scanCache.list;
    const list = [];
    for (const abs of files) {
        let code = '';
        try {
            code = fs.readFileSync(abs, 'utf8');
        } catch (e) {
            continue;
        }
        if (!/@name/.test(code)) continue;
        const meta = parseMeta(path.relative(PLUGIN_ROOT, abs), code);
        if (meta) list.push(meta);
    }
    for (const meta of registry.values()) {
        if (!list.some(p => p.name === meta.name)) list.push(meta);
    }
    scanCache = { sig, at: Date.now(), list };
    return list;
}

function list() {
    return scan(false);
}

function find(name) {
    const q = String(name || '').trim().replace(/\.js$/i, '');
    if (!q) return null;
    const all = scan(false);
    return (
        all.find(p => p.name === q) ||
        all.find(p => p.name.toLowerCase() === q.toLowerCase()) ||
        all.find(p => path.basename(p.file, '.js') === q) ||
        all.find(p => p.name.includes(q)) ||
        null
    );
}

function register(meta) {
    if (!meta || !meta.name) return false;
    const old = registry.get(meta.name) || {};
    registry.set(meta.name, Object.assign({}, old, meta, { name: meta.name, abs: meta.abs || '' }));
    scanCache.at = 0;
    return true;
}

function normalizeReply(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    if (typeof value === 'object' && value.msg) return String(value.msg);
    return String(value);
}

function makeShim(base, text, rules, from) {
    let matched = null;
    for (const rule of rules || []) {
        try {
            matched = String(text).match(new RegExp(rule));
        } catch (e) {
            matched = null;
        }
        if (matched) break;
    }
    const replies = [];
    const real = base && typeof base === 'object' ? base : {};
    const shim = new Proxy(real, {
        get(target, prop) {
            if (prop === 'getMsg') return () => String(text);
            if (prop === 'getFrom') return () => (typeof target.getFrom === 'function' ? target.getFrom() : from || 'call');
            if (prop === 'param') return i => (matched ? matched[i] || '' : '');
            if (prop === 'reply') {
                return async (...args) => {
                    const msg = normalizeReply(args[0]);
                    if (msg) replies.push(msg);
                    return true;
                };
            }
            if (prop === 'matched') return matched;
            const value = target[prop];
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
    return { shim, replies, matched };
}

async function callPlugin(name, text, ctx = {}) {
    const meta = find(name);
    if (!meta) return { ok: false, name, output: '', error: '插件不存在' };
    let mod;
    try {
        mod = require(meta.abs);
    } catch (e) {
        return { ok: false, name: meta.name, output: '', error: '加载失败：' + e.message };
    }
    const fn = typeof mod === 'function' ? mod : mod && mod.default;
    if (typeof fn !== 'function') return { ok: false, name: meta.name, output: '', error: '插件导出不是函数' };
    const { shim, replies, matched } = makeShim(ctx.sender, text, meta.rules, ctx.from);
    const timeout = Number(ctx.timeout) || 30000;
    let timer;
    try {
        const ret = await Promise.race([
            Promise.resolve().then(() => fn(shim)),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('调用超时')), timeout);
            }),
        ]);
        clearTimeout(timer);
        const output = replies.join('\n').trim() || (typeof ret === 'string' && ret !== 'next' ? ret.trim() : '');
        return { ok: true, name: meta.name, output, matched: !!matched, meta };
    } catch (e) {
        clearTimeout(timer);
        return { ok: false, name: meta.name, output: replies.join('\n').trim(), error: e.message };
    }
}

function emit(event, payload = {}) {
    const evt = Object.assign({ event, at: new Date().toISOString() }, payload);
    try {
        Promise.resolve(store.push('link', 'events', evt, 100)).catch(e => {
            console.error('[联动总线] 事件写入失败:', e.message);
        });
    } catch (e) {
        console.error('[联动总线] 事件写入失败:', e.message);
    }
    try {
        bus.emit(event, evt);
    } catch (e) {
        console.error('[联动总线] 事件处理失败:', event, e.message);
    }
    return evt;
}

function on(event, handler) {
    const wrapped = async payload => {
        try {
            await handler(payload);
        } catch (e) {
            console.error('[联动总线] 订阅失败:', event, e.message);
        }
    };
    bus.on(event, wrapped);
    return () => bus.off(event, wrapped);
}

async function recent(limit = 10) {
    const all = await store.get('link', 'events', []);
    return Array.isArray(all) ? all.slice(-Math.max(1, limit)).reverse() : [];
}

function notify(text, targets = []) {
    return emit('notify', { text: String(text || ''), targets: Array.isArray(targets) ? targets : [targets] });
}

function alert(text, targets = []) {
    return emit('alert', { text: String(text || ''), targets: Array.isArray(targets) ? targets : [targets] });
}

async function pushText(target, text, type = 'text') {
    const t = target || {};
    if (!t.platform || (!t.groupId && !t.userId)) return { ok: false, error: '目标缺少 platform/groupId/userId' };
    if (typeof global.sysMethod === 'undefined' || typeof global.sysMethod.push !== 'function') {
        return { ok: false, error: 'sysMethod.push 不可用' };
    }
    try {
        await global.sysMethod.push({
            platform: String(t.platform),
            type,
            msg: String(text || ''),
            ...(t.groupId ? { groupId: String(t.groupId) } : {}),
            ...(t.userId ? { userId: String(t.userId) } : {}),
        });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function hash(text) {
    return crypto.createHash('md5').update(String(text)).digest('hex');
}

module.exports = {
    PLUGIN_ROOT,
    scan,
    list,
    find,
    register,
    callPlugin,
    emit,
    on,
    recent,
    notify,
    alert,
    pushText,
    hash,
    store,
};
