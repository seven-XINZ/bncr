/**
 *  @author xinz
 *  @name 智能管家
 *  @team xinz
 *  @version 1.2.0
 *  @description 有记忆、有词库、有情绪的调度中枢：无大模型也能靠本地意图词库干活
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
const LEX_KEY = 'lexicon';
const MEM_KEY = 'memory';

const jsonSchema = BncrCreateSchema.object({
    apiBase: BncrCreateSchema.string().setTitle('接口地址').setDefault('https://ark.cn-beijing.volces.com/api/v3'),
    apiKey: BncrCreateSchema.string().setTitle('API Key').setDescription('可留空，留空走本地词库').setDefault(''),
    model: BncrCreateSchema.string().setTitle('模型').setDefault('doubao-seed-2-1-turbo'),
    name: BncrCreateSchema.string().setTitle('名字').setDefault('小新'),
    persona: BncrCreateSchema.string()
        .setTitle('性格设定')
        .setDefault('嘴上有点毒舌、心里挺靠谱；口语化短句，偶尔吐槽但不刻薄'),
    mode: BncrCreateSchema.string().setTitle('触发模式').setDescription('prefix / auto').setDefault('prefix'),
    prefix: BncrCreateSchema.string().setTitle('前缀').setDefault('ai'),
    authorizedUsers: BncrCreateSchema.string().setTitle('授权用户').setDefault(''),
    authorizedGroups: BncrCreateSchema.string().setTitle('授权群').setDefault(''),
    excludePlugins: BncrCreateSchema.string()
        .setTitle('屏蔽插件')
        .setDefault('智能管家\n智能AI聊天\nChatGPT\ndify\nGemini\n定时消息推送'),
    moodEnabled: BncrCreateSchema.boolean().setTitle('情绪系统').setDefault(true),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);
const StateDB = new BncrDB('智能管家状态');

/* ================= 情绪 ================= */
const MOODS = {
    calm: { label: '平静', style: '平稳、话不多但都在点上' },
    happy: { label: '开心', style: '轻快，愿意多聊两句，偶尔开玩笑' },
    hype: { label: '兴奋', style: '很冲，短句和感叹，容易上头' },
    grumpy: { label: '烦躁', style: '回话变短，带点不耐烦，但活照办' },
    tired: { label: '疲惫', style: '有点懒，回答简短' },
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/* ================= 词库（可被用户改写并存库） ================= */
const DEFAULT_INTENTS = [
    { keys: ['做个插件', '写个插件', '生成插件'], target: '插件工坊', build: q => (q ? `做个插件 ${q}` : '') },
    { keys: ['天气', '气温', '温度', '热不热', '冷不冷', '下雨', '带伞'], target: '天气', build: q => (q ? `${q}天气` : '') },
    { keys: ['热搜', '热榜', '热点', '热门'], target: '热点趋势', build: () => '微博热搜' },
    { keys: ['状态', '负载', '内存', 'cpu', '运行情况', '服务器'], target: '运行状态', build: () => '运行状态' },
    { keys: ['摸鱼', '无聊'], target: '摸鱼', build: () => '摸鱼' },
    { keys: ['菜单', '命令', 'help', '功能'], target: '鑫仔bot菜单', build: () => '#菜单' },
    { keys: ['60s', '早报', '新闻'], target: '每天60秒读懂世界', build: () => '60s' },
    { keys: ['二维码'], target: '二维码生成', build: q => (q ? `二维码生成 ${q}` : '') },
    { keys: ['搜索', '搜一下', '查一下资料'], target: '智能搜索', build: q => (q ? `搜索 ${q}` : '') },
    { keys: ['星座', '运势'], target: '星座运势', build: q => (q ? `今日运势 ${q}` : '') },
    { keys: ['待办', '任务清单'], target: '待办事项', build: () => '我的待办' },
];

const DEFAULT_CHAT = [
    { keys: ['你好', '在吗', '在不在', 'hi', 'hello'], replies: ['在。', '在的，说事。', '嗯，在。'] },
    { keys: ['你叫什么', '你是谁', '你叫啥'], replies: ['{name}。记不住就多问几次。', '我是{name}，这台的管家。'] },
    { keys: ['谢谢', '辛苦了', '多谢'], replies: ['不用谢，顺手的事。', '记我这次好就行。'] },
    { keys: ['晚安', '睡了', '睡觉'], replies: ['睡吧，别熬。', '晚安，明天别忘带脑子。'] },
    { keys: ['你累不累', '累吗', '你还好吗'], replies: ['体力{mood_energy}，还行。', '有点乏，但还能撑。'] },
    { keys: ['夸我', '我厉害吗', '我牛吗'], replies: ['行，你厉害，行了吧。', '这次算你厉害。'] },
];

/* ================= 插件目录 ================= */
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
    const pick = k => {
        const m = head.match(new RegExp('@' + k + '\\s+([^\\n\\r]+)'));
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

function resolvePlugin(all, key) {
    const k = String(key || '').trim();
    if (!k) return null;
    return (
        all.find(p => p.name === k) ||
        all.find(p => p.name.includes(k)) ||
        all.find(p => path.basename(p.file, '.js').includes(k)) ||
        null
    );
}

/* ================= 授权 ================= */
function splitList(raw) {
    return String(raw || '')
        .split(/\n|,/)
        .map(s => s.trim())
        .filter(Boolean);
}
function inList(list, v) {
    return list.some(i => i === '*' || i === v);
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

/* ================= 执行 ================= */
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
        get(t, p) {
            if (p === 'getMsg') return () => text;
            if (p === 'param') return i => (matched ? matched[i] || '' : '');
            const v = t[p];
            return typeof v === 'function' ? v.bind(t) : v;
        },
    });
}

async function runPlugin(meta, text, sender) {
    const mod = require(meta.file);
    const fn = typeof mod === 'function' ? mod : mod && mod.default;
    if (typeof fn !== 'function') throw new Error('插件导出不是函数');
    await fn(makeShim(sender, text, meta.rules));
}

/* ================= 词库读写 ================= */
async function loadLexicon() {
    const lex = (await StateDB.get(LEX_KEY, null)) || {};
    return {
        intents: Array.isArray(lex.intents) && lex.intents.length ? lex.intents : DEFAULT_INTENTS,
        chat: Array.isArray(lex.chat) && lex.chat.length ? lex.chat : DEFAULT_CHAT,
    };
}
async function saveLexicon(lex) {
    await StateDB.set(LEX_KEY, lex);
}

/* ================= 记忆 ================= */
async function loadMemory() {
    const m = (await StateDB.get(MEM_KEY, null)) || {};
    return { users: m.users || {}, shared: m.shared || [] };
}
async function saveMemory(m) {
    await StateDB.set(MEM_KEY, m);
}
function userMem(mem, uid) {
    if (!mem.users[uid]) mem.users[uid] = { name: '', facts: [], last: null };
    return mem.users[uid];
}

/* ================= 文本处理 ================= */
const FILLERS = ['帮我', '帮忙', '麻烦', '请', '给我', '查一下', '查询', '看看', '看一下', '怎么样', '如何', '呢', '吗', '吧', '的', '啊', '呀', '一下'];
function normalize(t) {
    return String(t || '')
        .toLowerCase()
        .replace(/[\s，。！？、,.!?~～:：;；"'“”‘’（）()【】\[\]]/g, '');
}
function stripFillers(t) {
    let out = t;
    for (const f of FILLERS) out = out.split(f).join('');
    return out;
}
function pickKey(text, keys) {
    for (const k of keys) if (text.includes(k.toLowerCase())) return k;
    return '';
}
function extractQuery(text, hitKey) {
    let q = text.split(hitKey).join('');
    q = stripFillers(q);
    if (q.length > 12) q = q.slice(0, 12);
    return q;
}

/* ================= 离线应答 ================= */
function moodLabel(st) {
    return MOODS[st.mood] ? MOODS[st.mood].label : '平静';
}
function render(tpl, cfg, st, mem) {
    return tpl
        .replace(/\{name\}/g, cfg.name)
        .replace(/\{mood\}/g, moodLabel(st))
        .replace(/\{mood_energy\}/g, String(Math.round(st.energy)))
        .replace(/\{user\}/g, (mem && mem.name) || '你');
}
function offlineChat(intent, cfg, st, mem) {
    const arr = intent.replies || [];
    const tpl = arr[Math.floor(Math.random() * arr.length)] || '';
    return render(tpl, cfg, st, mem);
}

/* ================= 大模型（可选） ================= */
async function think(cfg, text, all, st, uid, mem, userM) {
    const catalog = all
        .map(p => `${p.name}${p.admin ? '(仅管理员)' : ''}｜${p.desc}｜规则: ${p.rules.join(' ; ')}`)
        .slice(0, 80)
        .join('\n');
    const memText = [
        userM.name ? `对方叫 ${userM.name}` : '',
        userM.facts.length ? `已知关于对方：${userM.facts.slice(-12).join('；')}` : '',
        `好感度：${st.affinity[uid] || 0}`,
    ]
        .filter(Boolean)
        .join('\n');
    const sys = [
        `你是「${cfg.name}」。性格：${cfg.persona}`,
        `当前情绪：${moodLabel(st)}（${MOODS[st.mood] ? MOODS[st.mood].style : ''}），体力 ${Math.round(st.energy)}/100。`,
        memText,
        '你有判断和偏好，能表达态度，但不要编造事实。',
        '决策：闲聊/吐槽 → action=chat；能办的事 → action=run（plugin + command 必须匹配该插件规则）；没把握 → action=none。',
        '只输出 JSON：{"action":"chat|run|none","reply":"","plugin":"","command":"","mood":-2~2,"affinity":-2~2}',
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
    const js = (raw.match(/\{[\s\S]*\}/) || [''])[0];
    if (!js) throw new Error('模型未返回 JSON');
    return JSON.parse(js);
}

/* ================= 主流程 ================= */
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
    const prefix = String(cfg.prefix || 'ai');
    let text = rawMsg;
    if (String(cfg.mode || 'prefix').toLowerCase() === 'prefix') {
        const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i');
        if (!re.test(rawMsg)) return 'next';
        text = rawMsg.replace(re, '').trim();
    }
    if (!text) return s.reply(`${cfg.name}在，说事。`);
    if (!(await isAuthorized(s, cfg))) return s.reply('还没授权你调插件，找管理员加 userId。');

    const uid = s.getUserId();
    const st = (await StateDB.get(STATE_KEY, null)) || { mood: 'calm', energy: 70, affinity: {}, talks: 0, updatedAt: 0 };
    const mem = await loadMemory();
    const userM = userMem(mem, uid);
    const lex = await loadLexicon();

    // 自然恢复
    if (Date.now() - (st.updatedAt || 0) > 6 * 3600 * 1000) {
        st.mood = 'calm';
        st.energy = clamp(st.energy + 20, 10, 100);
    }
    st.energy = clamp((st.energy || 70) - 2, 10, 100);
    st.talks = (st.talks || 0) + 1;

    const low = normalize(text);

    /* ---------- 记忆指令 ---------- */
    if (/^(记住|记一下|帮我记住)/.test(low)) {
        const fact = text.replace(/^(记住|记一下|帮我记住)\s*/, '').trim();
        if (!fact) return s.reply('记住什么？说完整点。');
        if (!userM.facts.includes(fact)) userM.facts.push(fact);
        while (userM.facts.length > 20) userM.facts.shift();
        await saveMemory(mem);
        await StateDB.set(STATE_KEY, st);
        return s.reply(`记下了：${fact}`);
    }
    if (/^(忘记|删掉记忆|别记)/.test(low)) {
        const kw = stripFillers(text.replace(/^(忘记|删掉记忆|别记)\s*/, '').trim());
        const before = userM.facts.length;
        userM.facts = userM.facts.filter(f => !f.includes(kw));
        await saveMemory(mem);
        return s.reply(before === userM.facts.length ? `没找到跟「${kw}」有关的记忆。` : `删了 ${before - userM.facts.length} 条。`);
    }
    if (/^(你记得什么|记忆|我的记忆)$/.test(low) || low === 'mem') {
        const lines = [];
        if (userM.name) lines.push(`· 你叫 ${userM.name}`);
        for (const f of userM.facts) lines.push(`· ${f}`);
        lines.push(`· 好感度 ${st.affinity[uid] || 0}，当前心情 ${moodLabel(st)}`);
        return s.reply(lines.length > 1 ? '关于你我记得：\n' + lines.join('\n') : '对你暂时一无所知，说句「ai 记住 xxx」我就记。');
    }
    if (/^(我是谁|我叫什么|你知道我是谁吗)$/.test(low)) {
        return s.reply(userM.name ? `你是 ${userM.name}。` : '你还没告诉过我名字，说「ai 我叫xxx」。');
    }
    if (/^(词库|意图)/.test(low)) {
        const lines = lex.intents.slice(0, 10).map(i => `· ${i.keys.slice(0, 4).join('/')} → ${i.target}`);
        return s.reply(`本地词库共 ${lex.intents.length} 条意图：\n${lines.join('\n')}\n（无大模型时靠它做匹配）`);
    }

    // 自动记名字 / 常住地
    const nameHit = text.match(/(?:我叫|我是|叫我)([\u4e00-\u9fa5A-Za-z0-9_]{1,12})/);
    if (nameHit && !/谁|什么|吗|呢/.test(nameHit[1])) {
        userM.name = nameHit[1];
    }
    const cityHit = text.match(/(?:我在|我住|住在|坐标)([\u4e00-\u9fa5]{2,6})/);
    if (cityHit) {
        const fact = `住在${cityHit[1]}`;
        if (!userM.facts.includes(fact)) userM.facts.push(fact);
    }
    if (nameHit || cityHit) await saveMemory(mem);
    const ack = nameHit ? `记住你叫 ${userM.name} 了。` : cityHit ? `记下你在${cityHit[1]}了。` : '';

    /* ---------- 情绪与好感 ---------- */
    let deltaA = 0;
    if (/(谢谢|辛苦|爱你|牛|厉害|棒|靠谱)/.test(text)) deltaA += 1;
    if (/(垃圾|废物|傻|滚|闭嘴|烦死|蠢)/.test(text)) deltaA -= 2;
    st.affinity[uid] = clamp((st.affinity[uid] || 0) + deltaA, -10, 20);

    const all = scanPlugins().filter(p => !splitList(cfg.excludePlugins).includes(p.name));

    /* ---------- 大模型优先 ---------- */
    let plan = null;
    if (String(cfg.apiKey || '').trim()) {
        try {
            plan = await think(cfg, text, all, st, uid, mem, userM);
        } catch (e) {
            console.warn('[智能管家] 大脑掉线，走本地词库:', e.message);
        }
    }
    if (plan && typeof plan.mood === 'number' && cfg.moodEnabled) {
        const d = clamp(Number(plan.mood) || 0, -2, 2);
        if (d >= 2) st.mood = st.energy > 60 ? 'hype' : 'happy';
        else if (d === 1) st.mood = 'happy';
        else if (d === -1) st.mood = 'tired';
        else if (d <= -2) st.mood = 'grumpy';
    }
    if (plan && typeof plan.affinity === 'number') {
        st.affinity[uid] = clamp((st.affinity[uid] || 0) + clamp(plan.affinity, -2, 2), -10, 20);
    }

    if (plan && plan.action === 'chat' && String(plan.reply || '').trim()) {
        await saveMemory(mem);
        await StateDB.set(STATE_KEY, st);
        return s.reply(String(plan.reply).trim().slice(0, 300));
    }

    /* ---------- 本地意图路由 ---------- */
    let target = null;
    let command = '';
    let intent = null;
    for (const it of lex.intents) {
        const key = pickKey(low, it.keys);
        if (!key) continue;
        const q = extractQuery(low, key);
        const cmd = String(it.build ? it.build(q, text) : '') || '';
        const p = resolvePlugin(all, it.target);
        if (p && cmd) {
            target = p;
            command = cmd;
            intent = it;
            break;
        }
    }

    // 上一轮意图延续（"那明天呢"）
    if (!target && userM.last && /^(那|这|明天|后天|它|他)/.test(low)) {
        const p = resolvePlugin(all, userM.last.target);
        if (p) {
            target = p;
            command = userM.last.command;
        }
    }

    // 原始命令直接命中
    if (!target) {
        for (const p of all) {
            for (const r of p.rules) {
                try {
                    if (new RegExp(r).test(text)) {
                        target = p;
                        command = text;
                        break;
                    }
                } catch (e) {}
            }
            if (target) break;
        }
    }

    if (!target) {
        const chat = lex.chat.find(c => pickKey(low, c.keys));
        if (chat) {
            await saveMemory(mem);
            await StateDB.set(STATE_KEY, st);
            const reply = offlineChat(chat, cfg, st, userM);
            const extra = userM.facts.length && Math.random() < 0.3 ? `（你不是说过${userM.facts.slice(-1)[0]}吗）` : '';
            return s.reply(reply + extra);
        }
        await StateDB.set(STATE_KEY, st);
        const cand = [];
        for (const p of all) {
            if (p.desc && low.includes(p.name)) cand.push(p.name);
        }
        return s.reply(
            `没听懂。${cfg.name}能办：天气、热搜、服务器状态、搜东西、待办、菜单。\n试试「${prefix} 成都天气」或「${prefix} 记住 我住成都」。`
        );
    }

    /* ---------- 权限 ---------- */
    if (target.admin) {
        let ok = false;
        try {
            ok = !!(await s.isAdmin());
        } catch (e) {}
        const wx = await new BncrDB('wxClawBot').get('ownerId', '');
        if (!ok && wx && uid === wx) ok = true;
        if (!ok) {
            await StateDB.set(STATE_KEY, st);
            return s.reply(`「${target.name}」不是你能碰的。`);
        }
    }

    userM.last = { target: target.name, command, at: Date.now() };
    await saveMemory(mem);
    await StateDB.set(STATE_KEY, st);

    try {
        console.log(`[智能管家] ${uid} → ${target.name} ← ${command} (${moodLabel(st)})`);
        await runPlugin(target, command, s);
    } catch (e) {
        console.error('[智能管家] 执行失败:', e.message);
        await s.reply(`卡住了：${e.message}`);
    }
};
