/**
 *  @author xinz
 *  @name 智能管家
 *  @team xinz
 *  @version 1.0.0
 *  @description 用一句话调度整台 Bncr：把自然语言交给大模型路由，自动挑选并执行对应插件
 *  @rule ^(ai|AI)\s+([\s\S]+)$
 *  @admin false
 *  @public false
 *  @priority 99998
 *  @disable false
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PLUGIN_ROOT = path.join(__dirname, '..');
const SELF_FILE = __filename;

const jsonSchema = BncrCreateSchema.object({
    apiBase: BncrCreateSchema.string()
        .setTitle('接口地址')
        .setDescription('OpenAI 兼容 base；默认火山方舟，填好 Key 即可路由')
        .setDefault('https://ark.cn-beijing.volces.com/api/v3'),
    apiKey: BncrCreateSchema.string().setTitle('API Key').setDescription('sk- 开头').setDefault(''),
    model: BncrCreateSchema.string().setTitle('模型').setDefault('doubao-seed-2-1-turbo'),
    mode: BncrCreateSchema.string()
        .setTitle('触发模式')
        .setDescription('prefix=必须发「ai 需求」；auto=授权范围内全部消息自动接管')
        .setDefault('prefix'),
    prefix: BncrCreateSchema.string().setTitle('前缀').setDescription('prefix 模式下的触发词').setDefault('ai'),
    authorizedUsers: BncrCreateSchema.string()
        .setTitle('授权用户')
        .setDescription('每行一个 userId，支持 * 通配')
        .setDefault(''),
    authorizedGroups: BncrCreateSchema.string()
        .setTitle('授权群')
        .setDescription('每行一个群号，支持 * 通配')
        .setDefault(''),
    excludePlugins: BncrCreateSchema.string()
        .setTitle('屏蔽插件')
        .setDescription('每行一个插件名，避免递归或误触发')
        .setDefault('智能管家\n智能AI聊天\nChatGPT\ndify\nGemini\n定时消息推送'),
    maxSteps: BncrCreateSchema.number().setTitle('单次路由上限').setDefault(1),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

/* ---------------- 插件目录扫描 ---------------- */
const SKIP_DIRS = new Set(['node_modules', 'mod', '_archive', '.git', 'EncryptFiles']);
let cache = { at: 0, list: [] };

function parseMeta(file) {
    let head = '';
    try {
        head = fs.readFileSync(file, 'utf8').slice(0, 4000);
    } catch (e) {
        return null;
    }
    if (!/module\.exports/.test(head) && !/@name/.test(head)) return null;
    const pick = key => {
        const m = head.match(new RegExp('@' + key + '\\s+([^\\n\\r]+)'));
        return m ? m[1].trim() : '';
    };
    const rules = [...head.matchAll(/@rule\s+([^\n\r]+)/g)].map(m => m[1].trim()).filter(Boolean);
    if (!rules.length) return null;
    return {
        name: pick('name') || path.basename(file, '.js'),
        desc: pick('description'),
        rules,
        admin: /@admin\s+true/.test(head),
        disable: /@disable\s+true/.test(head),
        file,
    };
}

function scanPlugins(force) {
    const now = Date.now();
    if (!force && now - cache.at < 60000) return cache.list;
    const out = [];
    const walk = dir => {
        let items = [];
        try {
            items = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
            return;
        }
        for (const it of items) {
            if (it.name.startsWith('.')) continue;
            const full = path.join(dir, it.name);
            if (it.isDirectory()) {
                if (SKIP_DIRS.has(it.name)) continue;
                walk(full);
            } else if (it.name.endsWith('.js') && full !== SELF_FILE) {
                const meta = parseMeta(full);
                if (meta && !meta.disable) out.push(meta);
            }
        }
    };
    walk(PLUGIN_ROOT);
    cache = { at: now, list: out };
    return out;
}

/* ---------------- 授权 ---------------- */
function splitList(raw) {
    return String(raw || '')
        .split(/\n|,/)
        .map(s => s.trim())
        .filter(Boolean);
}
function inList(list, value) {
    return list.some(item => item === '*' || item === value);
}
async function isAuthorized(s, cfg) {
    const users = splitList(cfg.authorizedUsers);
    const groups = splitList(cfg.authorizedGroups);
    if (inList(users, s.getUserId())) return true;
    const gid = typeof s.getGroupId === 'function' ? String(s.getGroupId()) : '';
    if (gid && gid !== '0' && inList(groups, gid)) return true;
    if (users.includes('*')) return true;
    try {
        if (await s.isAdmin()) return true;
    } catch (e) {}
    const wx = await new BncrDB('wxClawBot').get('ownerId', '');
    if (wx && s.getUserId() === wx) return true;
    return false;
}

/* ---------------- 消息执行 ---------------- */
function makeShim(real, text, rules) {
    let matched = null;
    for (const r of rules) {
        try {
            matched = text.match(new RegExp(r));
        } catch (e) {
            matched = null;
        }
        if (matched) break;
    }
    return new Proxy(real, {
        get(t, prop) {
            if (prop === 'getMsg') return () => text;
            if (prop === 'param') return i => (matched ? matched[i] || '' : '');
            const v = t[prop];
            if (typeof v === 'function') return v.bind(t);
            return v;
        },
    });
}

async function runPlugin(meta, text, sender) {
    const mod = require(meta.file);
    const fn = typeof mod === 'function' ? mod : mod && mod.default;
    if (typeof fn !== 'function') throw new Error('插件导出不是函数');
    const shim = makeShim(sender, text, meta.rules);
    await fn(shim);
}

function buildCatalog(list) {
    return list
        .map((p, i) => `${i}. ${p.name}${p.admin ? '(仅管理员)' : ''}｜${p.desc}｜规则: ${p.rules.join(' ; ')}`)
        .join('\n');
}

async function llmRoute(cfg, text, list) {
    const catalog = buildCatalog(list.slice(0, 80));
    const sys =
        '你是 Bncr 机器人的调度器。根据用户需求，从插件表中选择唯一一个最合适的插件，并生成一条能匹配该插件规则命令的消息。' +
        '只输出 JSON：{"name":"插件名","command":"要发送给插件的消息","reason":"一句话原因"}。若无法匹配任何插件，输出 {"name":""}。' +
        'command 必须严格匹配所选插件的一条规则。';
    const res = await axios.post(
        `${String(cfg.apiBase).replace(/\/+$/, '')}/chat/completions`,
        {
            model: cfg.model,
            temperature: 0.1,
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: `插件表：\n${catalog}\n\n用户需求：${text}` },
            ],
        },
        { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey }, timeout: 60000 }
    );
    const raw = String((((res.data || {}).choices || [])[0] || {}).message?.content || '');
    const jsonText = (raw.match(/\{[\s\S]*\}/) || [''])[0];
    if (!jsonText) throw new Error('模型未返回 JSON');
    return JSON.parse(jsonText);
}

function keywordCandidates(text, list) {
    const grams = new Set();
    const clean = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    for (let i = 0; i < clean.length - 1; i++) grams.add(clean.slice(i, i + 2));
    const scored = [];
    for (const p of list) {
        const hay = (p.name + p.desc).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
        let hit = 0;
        for (const g of grams) if (hay.includes(g)) hit++;
        if (hit) scored.push({ p, score: hit / Math.max(1, grams.size) });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 5);
}

function matchByRules(text, list) {
    for (const p of list) {
        for (const r of p.rules) {
            try {
                if (new RegExp(r).test(text)) return { p, command: text };
            } catch (e) {}
        }
    }
    return null;
}

module.exports = async s => {
    await ConfigDB.get();
    const cfg = Object.assign(
        {
            apiBase: '',
            apiKey: '',
            model: 'doubao-seed-2-1-turbo',
            mode: 'prefix',
            prefix: 'ai',
            authorizedUsers: '',
            authorizedGroups: '',
            excludePlugins: '智能管家\n智能AI聊天\nChatGPT\ndify\nGemini\n定时消息推送',
        },
        ConfigDB.userConfig || {}
    );

    const rawMsg = String(s.getMsg() || '').trim();
    const mode = String(cfg.mode || 'prefix').toLowerCase();
    const prefix = String(cfg.prefix || 'ai');
    let text = rawMsg;
    if (mode === 'prefix') {
        const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i');
        if (!re.test(rawMsg)) return 'next';
        text = rawMsg.replace(re, '').trim();
    }
    if (!text) return s.reply('说点具体的，比如「' + prefix + ' 成都今天热不热」');

    if (!(await isAuthorized(s, cfg))) {
        return s.reply('当前会话未授权调度插件，请在「智能管家」配置里添加你的 userId 或群号。');
    }

    const exclude = splitList(cfg.excludePlugins).map(n => n.trim());
    const all = scanPlugins().filter(p => !exclude.includes(p.name));
    if (!all.length) return s.reply('没有可调度的插件');

    let target = null;
    let command = '';
    let why = '';

    // 1) 大模型路由（配置了 apiKey 才用）
    if (String(cfg.apiBase || '').trim() && String(cfg.apiKey || '').trim()) {
        try {
            const r = await llmRoute(cfg, text, all);
            if (r && r.name) {
                const p = all.find(x => x.name === r.name) || all.find(x => x.name.includes(r.name));
                if (p) {
                    target = p;
                    command = String(r.command || text).trim();
                    why = r.reason || '模型选择';
                }
            }
        } catch (e) {
            console.warn('[智能管家] 模型路由失败，回退关键词:', e.message);
        }
    }

    // 2) 原始文本直接匹配插件规则
    if (!target) {
        const hit = matchByRules(text, all);
        if (hit) {
            target = hit.p;
            command = hit.command;
            why = '规则精确匹配';
        }
    }

    // 3) 关键词兜底，只给建议不执行
    if (!target) {
        const cand = keywordCandidates(text, all).filter(c => c.score >= 0.25).slice(0, 3);
        if (!cand.length) return s.reply('没找到能干这事的插件，换个说法或者 #菜单 看看命令。');
        const lines = cand.map(c => `· ${c.p.name}：${c.p.desc || c.p.rules[0]}`);
        return s.reply('我猜你想用：\n' + lines.join('\n') + '\n可以直接说「' + prefix + ' ' + (cand[0].p.desc || cand[0].p.name) + '」或对应命令。');
    }

    if (target.admin) {
        let ok = false;
        try {
            ok = !!(await s.isAdmin());
        } catch (e) {}
        const wx = await new BncrDB('wxClawBot').get('ownerId', '');
        if (!ok && wx && s.getUserId() === wx) ok = true;
        if (!ok) return s.reply(`「${target.name}」只允许管理员调度`);
    }

    try {
        console.log(`[智能管家] ${s.getUserId()} → ${target.name} ← ${command} (${why})`);
        await runPlugin(target, command, s);
    } catch (e) {
        console.error('[智能管家] 执行失败:', e.message);
        await s.reply(`「${target.name}」执行失败：${e.message}`);
    }
};
