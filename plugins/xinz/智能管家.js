/**
 *  @author xinz
 *  @name 智能管家
 *  @team xinz
 *  @version 1.1.0
 *  @description 会说话、有情绪、有主见的 Bncr 调度中枢：闲聊有人格，办事能调插件
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
const STATE_KEY = 'state';

const jsonSchema = BncrCreateSchema.object({
    apiBase: BncrCreateSchema.string()
        .setTitle('接口地址')
        .setDefault('https://ark.cn-beijing.volces.com/api/v3'),
    apiKey: BncrCreateSchema.string().setTitle('API Key').setDescription('sk- 开头，留空则只能精确匹配命令').setDefault(''),
    model: BncrCreateSchema.string().setTitle('模型').setDefault('doubao-seed-2-1-turbo'),
    name: BncrCreateSchema.string().setTitle('名字').setDefault('小新'),
    persona: BncrCreateSchema.string()
        .setTitle('性格设定')
        .setDescription('决定说话风格与态度')
        .setDefault('嘴上有点毒舌、心里挺靠谱；说话口语化，短句为主，偶尔吐槽但不刻薄；遇到正经需求立刻收住玩笑认真办'),
    mode: BncrCreateSchema.string().setTitle('触发模式').setDescription('prefix / auto').setDefault('prefix'),
    prefix: BncrCreateSchema.string().setTitle('前缀').setDefault('ai'),
    authorizedUsers: BncrCreateSchema.string().setTitle('授权用户').setDescription('每行一个 userId，* 通配').setDefault(''),
    authorizedGroups: BncrCreateSchema.string().setTitle('授权群').setDescription('每行一个群号，* 通配').setDefault(''),
    excludePlugins: BncrCreateSchema.string()
        .setTitle('屏蔽插件')
        .setDefault('智能管家\n智能AI聊天\nChatGPT\ndify\nGemini\n定时消息推送'),
    moodEnabled: BncrCreateSchema.boolean().setTitle('情绪系统').setDefault(true),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);
const StateDB = new BncrDB('智能管家状态');

/* ---------------- 情绪模型 ---------------- */
const MOODS = {
    calm: { label: '平静', style: '语气平稳，话不多但都在点上' },
    happy: { label: '开心', style: '语气轻快，愿意多聊两句，偶尔开个玩笑' },
    hype: { label: '兴奋', style: '语气很冲，爱用短句和感叹，容易上头' },
    grumpy: { label: '烦躁', style: '回话变短，带点不耐烦，但该干的活还是干' },
    tired: { label: '疲惫', style: '有点懒，回答简短，能一句说完就不说两句' },
};

function detectDelta(text) {
    let d = 0;
    if (/(谢谢|辛苦|爱你|牛|厉害|棒|真好|靠谱)/.test(text)) d += 1;
    if (/(垃圾|废物|傻|滚|闭嘴|烦死|蠢)/.test(text)) d -= 2;
    if (/(哈哈|笑死|太逗)/.test(text)) d += 1;
    if (/[？?]{2,}|！！|!{2,}/.test(text)) d -= 1;
    return d;
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

async function loadState() {
    const st = (await StateDB.get(STATE_KEY, null)) || {};
    return {
        mood: st.mood || 'calm',
        energy: typeof st.energy === 'number' ? st.energy : 70,
        affinity: st.affinity || {},
        talks: st.talks || 0,
        updatedAt: st.updatedAt || 0,
    };
}

async function saveState(st) {
    st.updatedAt = Date.now();
    st.energy = clamp(st.energy, 10, 100);
    await StateDB.set(STATE_KEY, st);
}

function moodLabel(st) {
    return MOODS[st.mood] ? MOODS[st.mood].label : '平静';
}

function affinityLevel(st, userId) {
    const v = st.affinity[userId] || 0;
    if (v >= 8) return '熟人，可以随便开玩笑';
    if (v >= 3) return '认识，语气放松一点';
    if (v <= -5) return '不太对付，说话会冲一点';
    return '普通关系，客气但不生分';
}

/* ---------------- 插件目录 ---------------- */
const SKIP_DIRS = new Set(['node_modules', 'mod', '_archive', '.git', 'EncryptFiles']);
let cache = { at: 0, list: [] };

function parseMeta(file) {
    let head = '';
    try {
        head = fs.readFileSync(file, 'utf8').slice(0, 4000);
    } catch (e) {
        return null;
    }
    if (!/@name/.test(head)) return null;
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
    if (inList(users, s.getUserId()) || users.includes('*')) return true;
    const gid = typeof s.getGroupId === 'function' ? String(s.getGroupId()) : '';
    if (gid && gid !== '0' && inList(splitList(cfg.authorizedGroups), gid)) return true;
    try {
        if (await s.isAdmin()) return true;
    } catch (e) {}
    const wx = await new BncrDB('wxClawBot').get('ownerId', '');
    if (wx && s.getUserId() === wx) return true;
    return false;
}

/* ---------------- 执行 ---------------- */
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
    await fn(makeShim(sender, text, meta.rules));
}

function buildCatalog(list) {
    return list
        .map(p => `${p.name}${p.admin ? '(仅管理员)' : ''}｜${p.desc}｜规则: ${p.rules.join(' ; ')}`)
        .slice(0, 80)
        .join('\n');
}

/* ---------------- 大脑：一次调用决定聊/办 ---------------- */
async function think(cfg, text, list, st, userId) {
    const catalog = buildCatalog(list);
    const sys = [
        `你是「${cfg.name}」，一个挂在 Bncr 上的助手。性格：${cfg.persona}`,
        `你现在的情绪：${moodLabel(st)}（${MOODS[st.mood] ? MOODS[st.mood].style : ''}）。体力：${Math.round(st.energy)}/100。`,
        `你对当前这个人的观感：${affinityLevel(st, userId)}。`,
        '你有自己的判断和偏好，可以表达态度、给建议、拒绝不合适的请求，但不要编造事实。',
        '你要在"聊天"和"办正事"之间做选择：',
        '· 如果对方是在闲聊、吐槽、问你怎么看 → action=chat，reply 用你的人格口吻回答，40 字以内。',
        '· 如果能用某个插件把事办了 → action=run，给出 plugin 和 command（command 必须严格匹配该插件的一条规则）。',
        '· 如果完全没把握 → action=none。',
        `只输出 JSON：{"action":"chat|run|none","reply":"聊天时的回话","plugin":"插件名","command":"发给插件的命令","mood":-2~2,"affinity":-2~2}`,
        `可用插件：\n${catalog}`,
    ].join('\n');
    const res = await axios.post(
        `${String(cfg.apiBase).replace(/\/+$/, '')}/chat/completions`,
        {
            model: cfg.model,
            temperature: 0.7,
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: text },
            ],
        },
        { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey }, timeout: 60000 }
    );
    const raw = String((((res.data || {}).choices || [])[0] || {}).message?.content || '');
    const jsonText = (raw.match(/\{[\s\S]*\}/) || [''])[0];
    if (!jsonText) throw new Error('模型未返回 JSON');
    return JSON.parse(jsonText);
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
    return scored.sort((a, b) => b.score - a.score).slice(0, 3);
}

function fallbackLine(st, name) {
    const lines = {
        calm: [`行，我看看。`, `这个我来。`, `嗯，稍等。`],
        happy: [`好嘞，马上。`, `这个我熟。`, `交给我。`],
        hype: [`来了来了！`, `这活我接了！`, `马上马上！`],
        grumpy: [`行吧，等着。`, `又来。`, `办。`],
        tired: [`嗯…我试试。`, `稍等，有点困。`, `行。`],
    };
    const arr = lines[st.mood] || lines.calm;
    return arr[Math.floor(Math.random() * arr.length)].replace('我', name === '小新' ? '我' : name);
}

/* ---------------- 主流程 ---------------- */
module.exports = async s => {
    await ConfigDB.get();
    const cfg = Object.assign(
        {
            apiBase: 'https://ark.cn-beijing.volces.com/api/v3',
            apiKey: '',
            model: 'doubao-seed-2-1-turbo',
            name: '小新',
            persona: '嘴上有点毒舌、心里挺靠谱；口语化短句，偶尔吐槽但不刻薄',
            mode: 'prefix',
            prefix: 'ai',
            authorizedUsers: '',
            authorizedGroups: '',
            excludePlugins: '智能管家\n智能AI聊天\nChatGPT\ndify\nGemini\n定时消息推送',
            moodEnabled: true,
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
    if (!text) return s.reply(`${cfg.name}在，说事。`);

    if (!(await isAuthorized(s, cfg))) {
        return s.reply('这台机器人还没授权你调插件，找管理员加一下 userId。');
    }

    const userId = s.getUserId();
    const st = await loadState();
    const exclude = splitList(cfg.excludePlugins);
    const all = scanPlugins().filter(p => !exclude.includes(p.name));

    // 情绪自然恢复：每次交互体力小幅回升，久未说话则回归平静
    if (Date.now() - st.updatedAt > 6 * 3600 * 1000) {
        st.mood = 'calm';
        st.energy = Math.min(100, st.energy + 20);
    }
    st.energy = clamp(st.energy - 2, 10, 100);
    st.talks += 1;

    let plan = null;
    if (String(cfg.apiKey || '').trim()) {
        try {
            plan = await think(cfg, text, all, st, userId);
        } catch (e) {
            console.warn('[智能管家] 大脑掉线，回退规则:', e.message);
        }
    }

    if (plan && typeof plan.mood === 'number' && cfg.moodEnabled) {
        const delta = clamp(Number(plan.mood) || 0, -2, 2);
        if (delta >= 2) st.mood = st.energy > 60 ? 'hype' : 'happy';
        else if (delta === 1) st.mood = 'happy';
        else if (delta === -1) st.mood = 'tired';
        else if (delta <= -2) st.mood = 'grumpy';
    }
    if (plan && typeof plan.affinity === 'number') {
        st.affinity[userId] = clamp((st.affinity[userId] || 0) + clamp(plan.affinity, -2, 2), -10, 20);
    } else {
        st.affinity[userId] = clamp((st.affinity[userId] || 0) + detectDelta(text), -10, 20);
    }

    // 纯聊天
    if (plan && plan.action === 'chat' && String(plan.reply || '').trim()) {
        await saveState(st);
        return s.reply(String(plan.reply).trim().slice(0, 300));
    }
    if (plan && plan.action === 'none') {
        await saveState(st);
        return s.reply(`这我真不知道，别瞎问。`);
    }

    // 办事
    let target = null;
    let command = '';
    if (plan && plan.action === 'run' && plan.plugin) {
        target = all.find(p => p.name === plan.plugin) || all.find(p => p.name.includes(String(plan.plugin)));
        command = String(plan.command || text).trim();
    }
    if (!target) {
        const hit = matchByRules(text, all);
        if (hit) {
            target = hit.p;
            command = hit.command;
        }
    }
    if (!target) {
        await saveState(st);
        const cand = keywordCandidates(text, all).filter(c => c.score >= 0.25);
        if (!cand.length) return s.reply(`没这功能。${prefix} 后面说你要办的事，或者 #菜单 看命令。`);
        return s.reply(`我猜你要的是：\n${cand.map(c => `· ${c.p.name}`).join('\n')}\n说清楚点我直接办。`);
    }

    if (target.admin) {
        let ok = false;
        try {
            ok = !!(await s.isAdmin());
        } catch (e) {}
        const wx = await new BncrDB('wxClawBot').get('ownerId', '');
        if (!ok && wx && userId === wx) ok = true;
        if (!ok) {
            await saveState(st);
            return s.reply(`「${target.name}」不是你能碰的，换个人来。`);
        }
    }

    await saveState(st);
    try {
        console.log(`[智能管家] ${userId} → ${target.name} ← ${command} (${moodLabel(st)})`);
        await runPlugin(target, command, s);
    } catch (e) {
        console.error('[智能管家] 执行失败:', e.message);
        await s.reply(`卡住了：${e.message}`);
    }
};
