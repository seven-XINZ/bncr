/**
 *  @author xinz
 *  @name 智能管家
 *  @team xinz
 *  @version 1.8.2
 *  @description 启动即接管全部插件：本地知识库、槽位追问、指代消解、危险确认、生词自学习，无大模型也能干活
 *  @rule ^([\s\S]+)$
 *  @admin false
 *  @public false
 *  @priority 999999
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
    takeover: BncrCreateSchema.boolean().setTitle('接管全部插件').setDescription('开启后所有消息先由管家调度，关掉才需要前缀').setDefault(true),
    mode: BncrCreateSchema.string().setTitle('触发模式（旧）').setDescription('仅接管关闭时生效：auto / prefix').setDefault('auto'),
    prefix: BncrCreateSchema.string().setTitle('前缀').setDefault('ai'),
    authorizedUsers: BncrCreateSchema.string().setTitle('授权用户').setDefault(''),
    authorizedGroups: BncrCreateSchema.string().setTitle('授权群').setDefault(''),
    excludePlugins: BncrCreateSchema.string()
        .setTitle('屏蔽插件')
        .setDefault('智能管家\n智能AI聊天\nChatGPT\ndify\nGemini\n定时消息推送'),
    moodEnabled: BncrCreateSchema.boolean().setTitle('情绪系统').setDefault(true),
    historyRounds: BncrCreateSchema.number().setTitle('上下文轮数').setDescription('记住最近几轮对话，0 为关闭').setDefault(4),
    smartGate: BncrCreateSchema.boolean().setTitle('智能回应判断')
        .setDescription('群里没点名时，自己判断该不该接话；不该接就沉默，不刷屏').setDefault(true),
    gateThreshold: BncrCreateSchema.number().setTitle('接话阈值')
        .setDescription('分数越高越容易开口，默认 30；嫌吵调高、嫌闷调低').setDefault(30),
    gateCooldown: BncrCreateSchema.number().setTitle('接话冷却（秒）')
        .setDescription('同一个群两次主动接话的最小间隔').setDefault(120),
    interestWords: BncrCreateSchema.string().setTitle('兴趣词')
        .setDescription('逗号分隔，命中加分').setDefault('bncr,插件,bug,报错,日志,接口,api,docker,部署,重启,服务器,机器人,刷屏'),
    quietHours: BncrCreateSchema.string().setTitle('免打扰时段')
        .setDescription('如 23:30-07:30，此时段群里不主动接话').setDefault('23:30-07:30'),
    kbEnabled: BncrCreateSchema.boolean().setTitle('本地知识库').setDescription('读 mod/kb/*.md，离线回答 NAS/博客/踩坑类问题').setDefault(true),
    kbThreshold: BncrCreateSchema.number().setTitle('知识库命中线').setDescription('BM25 分数下限，默认 1.0；越高越保守').setDefault(1.0),
    dangerConfirm: BncrCreateSchema.boolean().setTitle('危险操作确认')
        .setDescription('重启/删除/清空类命令先问一句「确认」，60 秒内有效').setDefault(true),
    slotFill: BncrCreateSchema.boolean().setTitle('缺参数追问').setDescription('天气没给城市时先问一句，再执行').setDefault(true),
    debug: BncrCreateSchema.boolean().setTitle('调试日志').setDefault(false),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);
const StateDB = new BncrDB('智能管家状态');
const child = require('child_process');
const MOD_DIR = path.join(__dirname, 'mod');
let modStore = null;
try { modStore = require('./mod/store'); } catch (e) { console.log('[智能管家] mod/store 不可用:', e.message); }
let kbMod = null;
try { kbMod = require('./mod/kb'); } catch (e) { console.log('[智能管家] mod/kb 不可用:', e.message); }
async function SDBget(k, d) {
    if (modStore) {
        const v = await modStore.get('smart', k, undefined);
        if (v !== undefined) return v;
    }
    const old = await StateDB.get(k, d);
    if (modStore && old !== d) modStore.set('smart', k, old).catch(() => {});
    return old;
}
const SDB = {
    get: SDBget,
    set: async (k, v) => {
        if (modStore) {
            try { await modStore.set('smart', k, v); } catch (e) {}
        }
        return StateDB.set(k, v).catch(() => true);
    },
};
function loadSkills() {
    try {
        return (JSON.parse(fs.readFileSync(path.join(MOD_DIR, 'skills.json'), 'utf8')).skills || []).filter(x => x && x.name && x.file);
    } catch (e) {
        return [];
    }
}
function runSkill(sk, args) {
    return new Promise((resolve, reject) => {
        child.execFile('python3', [path.join(MOD_DIR, sk.file)].concat(args || []), { timeout: 15000 }, (err, so, se) => {
            if (err) return reject(new Error(String(se || err.message).slice(0, 200)));
            resolve(String(so || se || '').trim());
        });
    });
}

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
    { keys: ['做个插件', '写个插件', '生成插件', '造个插件'], target: '插件工坊', t: '做个插件 ${q}' },
    { keys: ['天气', '气温', '温度', '热不热', '冷不冷', '下雨', '带伞'], target: '天气', t: '${q}天气' },
    { keys: ['热搜', '热榜', '热点', '热门'], target: '热点趋势', t: '微博热搜' },
    { keys: ['状态', '负载', '内存', 'cpu', '运行情况', '服务器'], target: '运行状态', t: '运行状态' },
    { keys: ['摸鱼', '无聊'], target: '摸鱼', t: '摸鱼' },
    { keys: ['菜单', '命令', 'help', '功能'], target: '鑫仔bot菜单', t: '#菜单' },
    { keys: ['60s', '早报', '新闻'], target: '每天60秒读懂世界', t: '60s' },
    { keys: ['二维码'], target: '二维码生成', t: '二维码生成 ${q}' },
    { keys: ['搜索', '搜一下', '查一下资料'], target: '智能搜索', t: '搜索 ${q}' },
    { keys: ['星座', '运势'], target: '星座运势', t: '今日运势 ${q}' },
    { keys: ['待办', '任务清单'], target: '待办事项', t: '我的待办' },
];

const DEFAULT_CHAT = [
    { keys: ['你好', '在吗', '在不在', 'hi', 'hello'], replies: ['在。', '在的，说事。', '嗯，在。'] },
    { keys: ['你叫什么', '你是谁', '你叫啥'], replies: ['{name}。记不住就多问几次。', '我是{name}，这台的管家。'] },
    { keys: ['谢谢', '辛苦了', '多谢'], replies: ['不用谢，顺手的事。', '记我这次好就行。'] },
    { keys: ['晚安', '睡了', '睡觉'], replies: ['睡吧，别熬。', '晚安，明天别忘带脑子。'] },
    { keys: ['你累不累', '累吗', '你还好吗'], replies: ['体力{mood_energy}，还行。', '有点乏，但还能撑。'] },
    { keys: ['夸我', '我厉害吗', '我牛吗'], replies: ['行，你厉害，行了吧。', '这次算你厉害。'] },
    { keys: ['早', '早上好', '早安', '中午好', '下午好', '晚上好', '晚安'], replies: ['来了。', '嗯，在。'] },
    { keys: ['无聊', '聊会', '聊聊', '陪我聊'], replies: ['行，聊五毛钱的。', '说吧，我听着。', '聊可以，别聊工作。'] },
    { keys: ['讲个笑话', '说个笑话', '搞笑'], replies: ['我讲笑话的水平跟服务器负载一样，平时很低。', '有个 bug 走进了酒吧，老板问它要不要来杯 fix。'] },
];

/* ================= 插件目录 ================= */
const SKIP_DIRS = new Set(['node_modules', 'mod', '_archive', '.git', 'EncryptFiles']);
let cache = { at: 0, list: [] };

let pmCalls=0, pmNoName=0, pmNoRule=0;
function parseMeta(file) {
    pmCalls++;
    let head = '';
    try {
        head = fs.readFileSync(file, 'utf8').slice(0, 4000);
    } catch (e) {
        console.log('[智能管家] read err', file, e.message);
        return null;
    }
    if (!/@name/.test(head)) { pmNoName++; return null; }
    const pick = k => {
        const m = head.match(new RegExp('@' + k + '\\s+([^\\n\\r]+)'));
        return m ? m[1].trim() : '';
    };
    const rules = [...head.matchAll(new RegExp('@ru' + 'le\\s+([^\\n\\r]+)', 'g'))].map(m => m[1].trim()).filter(Boolean);
    if (!rules.length) { pmNoRule++; return null; }
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
    if (!force && now - cache.at < 10000) return cache.list;
    const out = [];
    let visited = 0;
    const walk = dir => {
        let names = [];
        try {
            names = fs.readdirSync(dir);
        } catch (e) {
            console.log('[智能管家] walk err', dir, e.message);
            return;
        }
        visited++;
        for (const name of names) {
            if (!name || name.startsWith('.')) continue;
            const full = path.join(dir, name);
            const isJs = /\.js$/i.test(name);
            let isDir = false;
            try {
                isDir = !!fs.statSync(full).isDirectory();
            } catch (e) {}
            if (isDir && !isJs) {
                if (SKIP_DIRS.has(name)) continue;
                walk(full);
            } else if (isJs && full !== SELF_FILE) {
                const meta = parseMeta(full);
                if (meta && !meta.disable) out.push(meta);
            }
        }
    };
    walk(PLUGIN_ROOT);
    if (!out.length) if (!out.length) console.log('[智能管家] scan empty dirs', visited);
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
function makeShim(real, text, rules, flag) {
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
            if (p === 'reply') {
                return (...args) => {
                    if (flag) flag.replied = true;
                    return t.reply(...args);
                };
            }
            if (p === 'param') return i => (matched ? matched[i] || '' : '');
            const v = t[p];
            return typeof v === 'function' ? v.bind(t) : v;
        },
    });
}

async function runPlugin(meta, text, sender, flag) {
    const mod = require(meta.file);
    const fn = typeof mod === 'function' ? mod : mod && mod.default;
    if (typeof fn !== 'function') throw new Error('插件导出不是函数');
    await fn(makeShim(sender, text, meta.rules, flag));
}

/* ================= 词库读写 ================= */
async function loadLexicon() {
    const lex = (await SDB.get(LEX_KEY, null)) || {};
    const intents = Array.isArray(lex.intents) && lex.intents.length ? lex.intents : DEFAULT_INTENTS;
    // 兼容旧版本存下来的、build 函数已被 JSON 丢弃的词条
    for (const it of intents) if (typeof it.build === 'function') delete it.build;
    return {
        intents,
        chat: Array.isArray(lex.chat) && lex.chat.length ? lex.chat : DEFAULT_CHAT,
        learned: Array.isArray(lex.learned) ? lex.learned : [],
    };
}
async function saveLexicon(lex) {
    await SDB.set(LEX_KEY, lex);
}

/* ================= 记忆 ================= */
async function loadMemory() {
    const m = (await SDB.get(MEM_KEY, null)) || {};
    return { users: m.users || {}, shared: m.shared || [] };
}
async function saveMemory(m) {
    await SDB.set(MEM_KEY, m);
}
function userMem(mem, uid) {
    if (!mem.users[uid]) mem.users[uid] = { name: '', facts: [], last: null, history: [] };
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
const SYNONYMS = [
    [/咋样|怎么样|如何/g, ''],
    [/查下|查询一下|看一下/g, '查'],
    [/多少度|几度/g, '温度'],
    [/几点钟|啥时候|什么时间/g, '几点'],
    [/帮我/g, ''],
    [/请问|麻烦/g, ''],
    [/现在|当前/g, ''],
];
function applySynonyms(t) {
    let out = t;
    for (const [re, to] of SYNONYMS) out = out.replace(re, to);
    return out;
}
function bigrams(str) {
    const s = String(str || '').replace(/\s/g, '');
    const out = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    if (!out.length && s) out.push(s);
    return out;
}
function dice(a, b) {
    const A = bigrams(a);
    const B = bigrams(b);
    if (!A.length || !B.length) return 0;
    const map = {};
    for (const x of A) map[x] = (map[x] || 0) + 1;
    let hit = 0;
    for (const y of B) {
        if (map[y]) {
            hit++;
            map[y]--;
        }
    }
    return (2 * hit) / (A.length + B.length);
}
function charOverlap(a, b) {
    const A = new Set(String(a).replace(/\s/g, ''));
    const B = new Set(String(b).replace(/\s/g, ''));
    let hit = 0;
    for (const c of A) if (B.has(c)) hit++;
    return (2 * hit) / (A.size + B.size || 1);
}
function fuzzyIntents(low, intents) {
    let best = null;
    for (const it of intents) {
        for (const k of it.keys || []) {
            const sc = Math.max(dice(low, String(k).toLowerCase()), charOverlap(low, String(k).toLowerCase()));
            if (sc >= 0.62 && (!best || sc > best.score)) best = { it, key: k, score: sc };
        }
    }
    return best;
}
function searchPlugins(all, q) {
    return all
        .map(p => ({ p, score: Math.max(dice(q, p.name), dice(q, p.desc || '') * 0.9) }))
        .filter(x => x.score >= 0.22)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(x => x.p);
}
function pickKey(text, keys) {
    let best = '';
    for (const k of keys) {
        const kk = String(k).toLowerCase();
        if (text.includes(kk) && kk.length > best.length) best = kk;
    }
    return best;
}
function escRe(t) {
    return String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/* 意图模板：${q} 替换为提取出的参数 */
function renderCmd(it, q) {
    if (typeof it.build === 'function') return String(it.build(q) || '');
    const t = String(it.t || '');
    return t.replace(/\$\{q\}/g, q);
}
function pickIntent(text, intents) {
    let best = null;
    for (const it of intents) {
        if (!Array.isArray(it.keys)) continue;
        const key = pickKey(text, it.keys);
        if (!key) continue;
        if (!best || key.length > best.key.length) best = { it, key };
    }
    return best;
}
/* 只对用户原文做一次替换，查询参数取原文大小写 */
function extractQueryFrom(raw, low, hitKey) {
    const re = new RegExp(escRe(hitKey), 'i');
    let q = String(raw).replace(re, ' ');
    q = stripFillers(q);
    q = q.replace(/[，。！？、,.!?~～:：;；"'“”‘’（）()【】\[\]]/g, ' ').replace(/\s+/g, '').trim();
    if (q.length > 16) q = q.slice(0, 16);
    return q;
}
function extractQuery(text, hitKey) {
    let q = text.split(hitKey).join('');
    q = stripFillers(q);
    if (q.length > 12) q = q.slice(0, 12);
    return q;
}

/* ================= 离线内置能力 ================= */
/**
 * 安全四则运算，不执行任意代码。
 * 仅接受数字、括号和 + - * /，用递归下降解析。
 */
function safeCalc(input) {
    const source = String(input).replace(/\s+/g, '');
    const tokens = source.match(/\d+(?:\.\d+)?|[()+\-*/]/g);
    if (!tokens || tokens.join('') !== source) return null;
    let pos = 0;
    const peek = () => tokens[pos];
    const parseExpr = () => {
        let v = parseTerm();
        while (peek() === '+' || peek() === '-') {
            const op = tokens[pos++];
            const r = parseTerm();
            v = op === '+' ? v + r : v - r;
        }
        return v;
    };
    const parseTerm = () => {
        let v = parseFactor();
        while (peek() === '*' || peek() === '/') {
            const op = tokens[pos++];
            const r = parseFactor();
            v = op === '*' ? v * r : v / r;
        }
        return v;
    };
    const parseFactor = () => {
        if (peek() === '+') { pos++; return parseFactor(); }
        if (peek() === '-') { pos++; return -parseFactor(); }
        if (peek() === '(') {
            pos++;
            const v = parseExpr();
            if (tokens[pos++] !== ')') throw new Error('括号不匹配');
            return v;
        }
        const t = tokens[pos++];
        if (!t || !/^\d/.test(t)) throw new Error('非法字符');
        return Number(t);
    };
    try {
        const value = parseExpr();
        if (pos !== tokens.length || !Number.isFinite(value)) return null;
        return value;
    } catch {
        return null;
    }
}

function builtinReply(text) {
    const t = normalize(text);
    if (/^(现在几点|几点了|什么时间|报时|时间)$/.test(t)) {
        const d = new Date();
        return `现在 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}，${d.getMonth() + 1} 月 ${d.getDate()} 号。`;
    }
    if (/^(今天几号|日期|今天星期几|星期几|今天)$/.test(t)) {
        const d = new Date();
        const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
        return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日，星期${w}。`;
    }
    const calc = text.match(/^(?:算一下|计算|算)\s*([0-9+\-*/(). %]+)$/);
    if (calc) {
        const expr = calc[1].replace(/%/g, '/100').replace(/[^0-9+\-*/(). ]/g, '');
        if (/^[0-9+\-*/(). ]+$/.test(expr)) {
            const v = safeCalc(expr);
            if (typeof v === 'number') return `${expr.trim()} = ${Math.round(v * 1e6) / 1e6}`;
        }
        return '这个式子我算不了，换个写法。';
    }
    if (/^(早|早上好|早安|中午好|下午好|晚上好|晚安|睡了)$/.test(t)) {
        const h = new Date().getHours();
        const bye = /晚安|睡/.test(t);
        if (bye) return '睡吧，明天还得干活。';
        if (h < 11) return '早，今天也别太拼。';
        if (h < 14) return '中午了，先吃饭。';
        if (h < 19) return '下午好，有事说事。';
        return '晚上了，别熬太晚。';
    }
    if (/^(抛硬币|扔硬币|硬币)$/.test(t)) return Math.random() < 0.5 ? '正面。' : '反面。';
    if (/^(掷骰子|扔骰子|骰子|摇骰子)$/.test(t)) return `${Math.floor(Math.random() * 6) + 1} 点。`;
    const pick = text.match(/^(?:随机选|帮我选|二选一|选一个)\s*([^，。！？]+)$/);
    if (pick) {
        const opts = pick[1].split(/还是|或者|、|,|，|\s+/).filter(Boolean);
        if (opts.length >= 2) return `选 ${opts[Math.floor(Math.random() * opts.length)]}。`;
    }
    return '';
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
const OPINION_POOL = [
    '这事我没什么立场，你自己拿主意更靠谱。',
    '要我说，先做再说，想太多容易黄。',
    '我不太确定，但感觉你说的有道理。',
    '别问我，问就是看情况。',
];
function opinionReply(cfg, st) {
    const pool = st.mood === 'grumpy' ? ['你自己不是有答案吗。', '这事问我没用，我又不能替你决定。'] : OPINION_POOL;
    return pool[Math.floor(Math.random() * pool.length)];
}
/* ================= 本地知识库、槽位、指代、危险确认 ================= */
const SLOT_ASK = {
    天气: { slot: '城市', ask: '哪个城市？回一个城市名就行。' },
    插件工坊: { slot: '插件需求', ask: '要什么插件？一句话说功能，比如「查询快递物流」。' },
    二维码生成: { slot: '内容', ask: '二维码要放什么内容？链接或一段文字。' },
    智能搜索: { slot: '关键词', ask: '搜什么？给个关键词。' },
    星座运势: { slot: '星座', ask: '哪个星座？' },
};
const DANGER_RE = /(重启|关机|停止|停掉|删除|删掉|卸载|清空|格式化|重置|强制|kill|rm\\s|rmdir|drop\\s|truncate|shutdown|reboot)/i;
function needsConfirm(command, cfg) {
    if (cfg.dangerConfirm === false) return false;
    return DANGER_RE.test(String(command || ''));
}
function cleanKbBody(text) {
    return String(text || '')
        .replace(/^#{1,4}\s*/gm, '')
        .replace(/\*\*/g, '')
        .replace(/^\s*-\s*/gm, '')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function kbFormat(results) {
    return results
        .map(x => {
            const t = String(x.title || '').replace(/\*\*/g, '').trim();
            const rest = x.text.split('\n').slice(1).join(' ');
            let body = cleanKbBody(rest || x.text);
            if (body.startsWith(t)) body = body.slice(t.length).trim();
            const url = (body.match(/https?:\/\/\S+/) || [])[0] || '';
            body = body.replace(url, '').replace(/^[：:，,、\-\s]+/, '').slice(0, 190);
            return `【${t}】${body}${url ? '\n' + url : ''}`;
        })
        .join('\n\n');
}
function kbQuery(q, limit) {
    if (!kbMod) return null;
    try {
        const n = limit || 2;
        const qx = String(q).replace(/怎么接|如何接|接入/g, '对接');
        let r = kbMod.search(qx, n) || [];
        const clean = qx.replace(/装什么|推荐|有没有|哪些|怎么装|怎么配|什么好|项目|东西/g, '').trim();
        if (clean && clean !== qx) {
            const r2 = kbMod.search(clean, n) || [];
            const seen = new Set(r.map(x => x.file + '|' + x.title));
            for (const x of r2) {
                const k = x.file + '|' + x.title;
                if (!seen.has(k)) {
                    r.push(x);
                    seen.add(k);
                }
            }
            r.sort((a, b) => b.score - a.score);
            r = r.slice(0, n);
        }
        return r.length ? r : null;
    } catch (e) {
        return null;
    }
}
async function addMiss(text, gid) {
    if (!modStore) return;
    try {
        const arr = (await modStore.get('miss', 'items', [])) || [];
        const k = normalize(text).slice(0, 40);
        const hit = arr.find(x => x.k === k);
        if (hit) {
            hit.n = (hit.n || 1) + 1;
            hit.last = Date.now();
        } else {
            arr.push({ k, t: String(text).slice(0, 60), n: 1, first: Date.now(), last: Date.now(), gid: gid || '' });
        }
        while (arr.length > 300) arr.shift();
        await modStore.set('miss', 'items', arr);
    } catch (e) {}
}
async function readMiss() {
    if (!modStore) return [];
    try {
        return (await modStore.get('miss', 'items', [])) || [];
    } catch (e) {
        return [];
    }
}
function deref(text, userM) {
    const list = (userM && userM.entities) || [];
    if (!list.length) return text;
    const last = list[list.length - 1];
    if (Date.now() - (last.at || 0) > 10 * 60 * 1000) return text;
    return String(text).replace(/^(它|他|她|这个|那个|刚才那个|上一个)[，,、\s]*/, last.name + ' ');
}
function pushEntity(userM, name, cmd) {
    if (!userM.entities) userM.entities = [];
    userM.entities.push({ name, cmd, at: Date.now() });
    while (userM.entities.length > 5) userM.entities.shift();
}

/* 群里接话：没命中插件时别只会说「没听懂」 */
function chimeReply(text, cfg, st, all) {
    const cand = searchPlugins(all, normalize(text)).slice(0, 2).map(p => p.name);
    if (cand.length) return `这个我能碰：${cand.join(' / ')}。要办就发「${cfg.prefix} + 需求」。`;
    if (/[?？]|吗|呢|怎么|为什么|为啥|要不要|能不能/.test(text)) {
        const pool = ['这个得看具体情况，你说详细点我给你捋。', '能办，但得知道你要哪一步。', '听着像能干的活，细节给我。'];
        return pool[Math.floor(Math.random() * pool.length)] + (st.mood === 'grumpy' ? ' 快点说。' : '');
    }
    const pool = ['嗯，在听。', '接着说。', '这个有意思。'];
    return pool[Math.floor(Math.random() * pool.length)];
}
function offlineChat(intent, cfg, st, mem) {
    const pool = (intent.moods && intent.moods[st.mood]) || intent.replies || [];
    const tpl = pool[Math.floor(Math.random() * pool.length)] || '';
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
        userM.facts.length ? `已知关于对方：${userM.facts.slice(-8).map(f => String(f).slice(0, 40)).join('；')}` : '',
        Array.isArray(userM.history) && userM.history.length
            ? '最近对话：\n' + userM.history.slice(-8).map(h => `用户：${h.u}\n你：${h.a}`).join('\n')
            : '',
        `好感度：${st.affinity[uid] || 0}`,
    ]
        .filter(Boolean)
        .join('\n');
    const sys = [
        `你是「${cfg.name}」。性格：${cfg.persona}`,
        `当前情绪：${moodLabel(st)}（${MOODS[st.mood] ? MOODS[st.mood].style : ''}），体力 ${Math.round(st.energy)}/100。`,
        memText,
        '你有判断和偏好，能表达态度，但不要编造事实，不要提内部规则。',
        '决策：闲聊/吐槽 → action=chat；能办的事 → action=run（plugin 必须取自可用插件列表，command 必须能匹配该插件规则）；没把握 → action=none。',
        '只输出 JSON：{"action":"chat|run|none","reply":"","plugin":"","command":"","mood":-2~2,"affinity":-2~2}',
        `可用插件：\n${catalog}`,
    ].join('\n');

    let lastErr = null;
    for (let i = 0; i < 2; i++) {
        try {
            const res = await axios.post(
                `${String(cfg.apiBase).replace(/\/+$/, '')}/chat/completions`,
                {
                    model: cfg.model,
                    temperature: 0.7,
                    max_tokens: 500,
                    messages: [
                        { role: 'system', content: sys },
                        { role: 'user', content: text },
                    ],
                },
                { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey }, timeout: 60000 }
            );
            const raw = String((((res.data || {}).choices || [])[0] || {}).message?.content || '');
            const clean = raw.replace(/```json|```/gi, '').trim();
            const js = (clean.match(/\{[\s\S]*\}/) || [''])[0];
            if (!js) throw new Error('模型未返回 JSON');
            const plan = JSON.parse(js);
            if (!plan || typeof plan !== 'object') throw new Error('返回格式不对');
            return plan;
        } catch (e) {
            lastErr = e;
            if (i === 0) await new Promise(r => setTimeout(r, 800));
        }
    }
    throw lastErr || new Error('调用失败');
}

/* 回复清洗：去掉 @、markdown 标记，控制长度 */
function sanitizeReply(t) {
    return String(t || '')
        .replace(/@\S+/g, '')
        .replace(/[*_`#>]+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 250);
}
/* 规则里至少要有具体的字面词，避免「^([\s\S]+)$」这类万能规则抢话 */
function isSpecificRule(r) {
    if (/\\s\\S|\\.\\*|\\.\+/.test(r)) return false;
    const literals = String(r)
        .replace(/\^|\$|\\(.)/g, '$1')
        .replace(/[.*+?()[\]{}|]/g, '')
        .match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}/g);
    return !!(literals && literals.length);
}
function ruleFits(meta, cmd) {
    return meta.rules.some(r => {
        try {
            return new RegExp(r).test(cmd);
        } catch (e) {
            return false;
        }
    });
}
function pushHistory(userM, u, a, rounds) {
    if (!rounds || !a) return;
    if (!Array.isArray(userM.history)) userM.history = [];
    userM.history.push({ u: String(u).slice(0, 80), a: String(a).slice(0, 120), at: Date.now() });
    while (userM.history.length > rounds * 2) userM.history.shift();
}
function helpText(cfg, lex, all, prefix) {
    const tips = lex.intents
        .slice(0, 8)
        .map(it => `「${prefix} ${it.keys[0]}」`)
        .join('、');
    return [
        `我是${cfg.name}，现在能调度 ${all.length} 个插件。`,
        `常用：${tips}`,
        `记性：${prefix} 记住 xxx / ${prefix} 你记得什么 / ${prefix} 清空记忆`,
        `学词：${prefix} 学词 查快递 => SSH终端管家Pro`,
        `接话：群里不点名时我自己判断该不该开口；${prefix} 回应 看判断日志`,
        `知识库：${prefix} 知识 NAS 装什么 / ${prefix} 知识 海豚AI 怎么接 / ${prefix} 知识库`,
        `生词：${prefix} 生词本 看没接住的话，${prefix} 学词 关键词 => 插件名 补上`,
        '没配大模型也能用，靠本地词库兜底。',
    ].join('\n');
}

/* ================= 智能回应判断：该不该接话 ================= */
function groupIdOf(s) {
    try {
        const g = typeof s.getGroupId === 'function' ? s.getGroupId() : s.groupId;
        return g && String(g) !== '0' ? String(g) : '';
    } catch (e) {
        return '';
    }
}
function isAtMe(s, rawMsg, name) {
    if (/\[CQ:at,/i.test(rawMsg) && /\b(all|0)\b/i.test(rawMsg)) return false;
    if (new RegExp('@\\s*' + escRe(name)).test(rawMsg)) return true;
    if (new RegExp('\\[CQ:at,qq=' + escRe(String((s.getUserId && s.getUserId()) || '')) + '\\]').test(rawMsg)) return true;
    return false;
}
function inQuietHours(qh) {
    const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(String(qh || '').trim());
    if (!m) return false;
    const cur = new Date().getHours() * 60 + new Date().getMinutes();
    const a = Number(m[1]) * 60 + Number(m[2]);
    const b = Number(m[3]) * 60 + Number(m[4]);
    return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}
const SELF_CMD_RE = /^(回应|接话|回应策略|回应日志|要不要回|为什么没回|怎么没回|刚才怎么没回|想不想回|闭嘴|说话|解除静音|别闭嘴|可以说话了|记住|记一下|记着|帮我记住|忘记|忘掉|删掉记忆|别记|清空记忆|清除记忆|全忘掉|resetmemory|词库|学词|删词|你会什么|你能做什么|技能|刷新插件|找插件|我叫|我是谁|你记得什么|阈值|接话阈值|冷却|接话冷却)/;
const GATE_EMOJI = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;
function gateScore(text, ctx) {
    const low = normalize(text);
    let sc = 0;
    const why = [];
    const add = (n, r) => { sc += n; why.push((n > 0 ? '+' : '') + n + ' ' + r); };
    if (/^(哈+|6+|好+|嗯+|哦+|ok|收到|行|可以|牛|赞|强|笑死|确实|真的|对|是的|草|卧槽|666|1)[!！。.?？~～ 　]*$/i.test(low)) add(-60, '纯附和/语气词');
    if (GATE_EMOJI.test(String(text))) add(-50, '纯表情');
    if (/^(https?:\/\/|www\.)/i.test(low)) add(-40, '纯链接');
    if (/^\[CQ:(?:image|record|video|file)|^\[图片|^\[视频|^\[语音|^\[文件/.test(String(text))) add(-45, '纯媒体');
    if (ctx.strong) add(45, '明确命令');
    if (low.length < 4) add(-30, '太短');
    else if (low.length <= 60) add(12, '长度适中');
    else add(-8, '太长');
    if (/[?？]|吗|呢|怎么|为什么|为啥|啥|多少|几点|几号|能不能|可不可以|帮我|查一下|查下|看一下|看下|有没有/.test(low)) add(30, '问句/请求');
    if (/(帮|查|开|关|发|写|做|生成|下载|重启|部署|装|安装|修|跑|执行|设置|配置)/.test(low)) add(12, '动作词');
    let hits = 0;
    for (const w of ctx.interests) if (w && low.includes(String(w).toLowerCase())) hits++;
    if (hits) add(Math.min(35, hits * 18), '兴趣词×' + hits);
    if (/@/.test(String(text)) && !ctx.mentioned) add(-20, '在跟别人说话');
    const moodAdj = { happy: 8, hype: 12, grumpy: -12, tired: -10, calm: 0 }[ctx.mood] || 0;
    if (moodAdj) add(moodAdj, '心情 ' + ctx.mood);
    if (ctx.energy < 30) add(-10, '体力低');
    if (ctx.affinity >= 20) add(8, '熟人'); else if (ctx.affinity < 0) add(-6, '不熟');
    return { sc, why };
}
async function gateDecide(s, rawMsg, cfg, opt) {
    const st = (await SDB.get(STATE_KEY, null)) || { mood: 'calm', energy: 70, affinity: {}, updatedAt: 0 };
    st.gate = st.gate || { log: [], last: {}, mute: {}, cfg: {} };
    const gid = groupIdOf(s) || 'group';
    const now = Date.now();
    const override = st.gate.cfg || {};
    const base = Number(override.th || cfg.gateThreshold || 30);
    const cd = Number(override.cd || cfg.gateCooldown || 120) * 1000;
    const moodTh = { grumpy: 10, tired: 8, hype: -8, happy: -4 }[st.mood] || 0;
    const th = base + moodTh;
    const uid = String((s.getUserId && s.getUserId()) || '');
    const ctx = {
        interests: splitList(cfg.interestWords),
        mood: cfg.moodEnabled === false ? 'calm' : st.mood,
        energy: st.energy,
        affinity: (st.affinity || {})[uid] || 0,
        strong: !!(opt && opt.strong),
    };
    const { sc, why } = gateScore(rawMsg, ctx);
    let reply = false;
    let reason = '';
    if (st.gate.mute && st.gate.mute[gid] && st.gate.mute[gid] > now) reason = '本群静音中（剩 ' + Math.ceil((st.gate.mute[gid] - now) / 60000) + ' 分）';
    else if (inQuietHours(cfg.quietHours)) reason = '免打扰时段 ' + cfg.quietHours;
    else if ((st.gate.last[gid] || 0) + cd > now && sc < 55) reason = '接话冷却中（' + Math.ceil(((st.gate.last[gid] || 0) + cd - now) / 1000) + 's）';
    else if (sc < th) reason = '分数 ' + sc + ' < 阈值 ' + th;
    else { reply = true; reason = '分数 ' + sc + ' ≥ 阈值 ' + th; }
    st.gate.log.push({ t: now, gid, sc, th, reply, reason, text: String(rawMsg).slice(0, 60) });
    while (st.gate.log.length > 30) st.gate.log.shift();
    if (reply) st.gate.last[gid] = now;
    await SDB.set(STATE_KEY, st);
    if (cfg.debug) console.log('[智能管家] 接话判断 ' + (reply ? '回' : '不回') + ' | ' + reason + ' | ' + String(rawMsg).slice(0, 40));
    return { reply, sc, th, reason, why };
}
function gateReport(cfg, st, gid) {
    const g = (st && st.gate) || {};
    const log = g.log || [];
    const yes = log.filter(x => x.reply).length;
    const no = log.length - yes;
    const lines = [
        '智能回应：' + (cfg.smartGate === false ? '关' : '开') + '｜阈值 ' + ((g.cfg && g.cfg.th) || cfg.gateThreshold || 30) +
            '｜冷却 ' + ((g.cfg && g.cfg.cd) || cfg.gateCooldown || 120) + 's｜免打扰 ' + (cfg.quietHours || '关'),
        '本群：' + (gid ? (g.mute && g.mute[gid] > Date.now() ? '静音剩 ' + Math.ceil((g.mute[gid] - Date.now()) / 60000) + ' 分' : '正常') : '私聊（句句都回）'),
        '最近判断 ' + log.length + ' 条：回 ' + yes + ' / 不回 ' + no,
    ];
    log.slice(-6).forEach(x => {
        const d = new Date(x.t);
        const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        lines.push(hh + ' [' + (x.reply ? '回' : '不回') + '] ' + x.reason + ' ｜ ' + x.text);
    });
    return lines.join('\n');
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
            mode: 'auto',
            prefix: 'ai',
            authorizedUsers: '',
            authorizedGroups: '',
            excludePlugins: '智能管家\n智能AI聊天\nChatGPT\ndify\nGemini\n定时消息推送',
            moodEnabled: true,
            smartGate: true,
            gateThreshold: 30,
            gateCooldown: 120,
            interestWords: 'bncr,插件,bug,报错,日志,接口,api,docker,部署,重启,服务器,机器人,刷屏',
            quietHours: '23:30-07:30',
            kbEnabled: true,
            kbThreshold: 1.0,
            dangerConfirm: true,
            slotFill: true,
        },
        ConfigDB.userConfig || {}
    );

    const rawMsg = String(s.getMsg() || '').trim();
    const prefix = String(cfg.prefix || 'ai');
    const aliasRe = new RegExp('^(?:' + [prefix, 'ai', '小新', '管家'].map(x => escRe(x)).join('|') + ')[，,：:]?\\s*', 'i');
    const takeover = cfg.takeover !== false;
    const isPrefixMode = !takeover && String(cfg.mode || 'auto').toLowerCase() === 'prefix';
    let text = rawMsg;
    if (aliasRe.test(rawMsg)) {
        text = rawMsg.replace(aliasRe, '').trim();
    } else if (isPrefixMode) {
        return 'next';
    } else {
        // auto 模式：只接得住认得的需求，其余交还其它插件
        if (!(await isAuthorized(s, cfg))) return 'next';
        const q = normalize(rawMsg);
        if (q.length < 2) return 'next';
        const lex0 = await loadLexicon();
        const p0 = scanPlugins();
        const hitLex = pickIntent(q, lex0.intents);
        const hitChat = lex0.chat.some(c => pickKey(q, c.keys));
        const hitRule = p0.some(p => ruleFits(p, rawMsg));
        if (!hitLex && !hitChat && !hitRule) return 'next';
        text = rawMsg;
    }
    /* ---------- 群里没点名：自己判断该不该接话 ---------- */
    const gid = groupIdOf(s);
    const isGroup = !!gid;
    let gatePassed = false;
    let pendFresh = false;
    if (isGroup && cfg.slotFill !== false) {
        try {
            const m0 = await loadMemory();
            const p0 = userMem(m0, String((s.getUserId && s.getUserId()) || ''));
            pendFresh = !!(p0.pending && Date.now() - p0.pending.at < 180000 &&
                rawMsg.length <= 20 && !/[?？]|吗|呢|怎么/.test(rawMsg));
        } catch (e) {}
    }
    if (isGroup && !aliasRe.test(rawMsg) && !isAtMe(s, rawMsg, cfg.name) && cfg.smartGate !== false &&
        !SELF_CMD_RE.test(normalize(rawMsg)) && !pendFresh) {
        let strong = false;
        try {
            strong = scanPlugins().some(p => (p.rules || []).some(r => isSpecificRule(r) && ruleFits({ rules: [r] }, rawMsg)));
        } catch (e) {}
        const d = await gateDecide(s, rawMsg, cfg, { strong });
        if (!d.reply) return 'next';
        gatePassed = true;
        text = rawMsg.replace(new RegExp('@\\s*' + escRe(cfg.name), 'g'), '').trim() || rawMsg;
    }

    if (!text) return s.reply(`${cfg.name}在，说事。`);
    if (!(await isAuthorized(s, cfg))) {
        return isGroup && !aliasRe.test(rawMsg) ? 'next' : s.reply('还没授权你调插件，找管理员加 userId。');
    }

    const uid = s.getUserId();
    const st = (await SDB.get(STATE_KEY, null)) || { mood: 'calm', energy: 70, affinity: {}, talks: 0, updatedAt: 0 };
    const mem = await loadMemory();
    const userM = userMem(mem, uid);
    const lex = await loadLexicon();
    const all = scanPlugins().filter(p => !splitList(cfg.excludePlugins).includes(p.name));

    // 自然恢复
    if (Date.now() - (st.updatedAt || 0) > 6 * 3600 * 1000) {
        st.mood = 'calm';
        st.energy = clamp(st.energy + 20, 10, 100);
    }
    st.energy = clamp((st.energy || 70) - 2, 10, 100);
    st.talks = (st.talks || 0) + 1;

    const origText = text;
    text = deref(text, userM);
    const low = normalize(text);
    const lowx = applySynonyms(low);
    const done = () => SDB.set(STATE_KEY, st);

    /* ---------- 危险操作确认 ---------- */
    if (userM.confirm) {
        const cn = normalize(text);
        const c = userM.confirm;
        if (/^(确认|确定|执行|继续|是|好|干|yes|y|ok)$/.test(cn)) {
            userM.confirm = null;
            const p = resolvePlugin(all, c.target);
            if (!p) {
                await saveMemory(mem);
                await done();
                return s.reply('那个插件已经不在了。');
            }
            await saveMemory(mem);
            await done();
            const f = { replied: false };
            try {
                await runPlugin(p, c.command, s, f);
            } catch (e) {
                return s.reply(`卡住了：${e.message}`);
            }
            if (!f.replied) return s.reply(`${p.name} 收下了但没回话。`);
            return;
        }
        if (/^(取消|算了|不|别|no|n)$/.test(cn)) {
            userM.confirm = null;
            await saveMemory(mem);
            await done();
            return s.reply('行，不动。');
        }
        userM.confirm = null;
    }

    /* ---------- 槽位追问后的回答 ---------- */
    const pendOther = !!(userM.pending && (SELF_CMD_RE.test(low) || /[?？]|吗|呢|怎么|为什么|多少/.test(text) || low.length > 20 ||
        !!pickIntent(applySynonyms(low), lex.intents)));
    if (userM.pending && pendOther) {
        userM.pending = null;
        await saveMemory(mem);
    }
    if (userM.pending && Date.now() - userM.pending.at < 180000 && !SELF_CMD_RE.test(low)) {
        if (/^(取消|算了|不|别|no|n)$/.test(low)) {
            userM.pending = null;
            await saveMemory(mem);
            await done();
            return s.reply('行，这事先放着。');
        }
        const pend = userM.pending;
        userM.pending = null;
        const p = resolvePlugin(all, pend.target);
        const cmd = renderCmd({ t: pend.tpl }, text);
        if (!p) {
            await saveMemory(mem);
            await done();
            return s.reply('那个插件不在了。');
        }
        if (needsConfirm(cmd, cfg)) {
            userM.confirm = { target: p.name, command: cmd, at: Date.now() };
            await saveMemory(mem);
            await done();
            return s.reply(`「${p.name}」要执行：${cmd}\n这动作有点重，回「确认」执行，60 秒内有效。`);
        }
        userM.last = { target: p.name, command: cmd, at: Date.now(), gid };
        pushEntity(userM, p.name, cmd);
        await saveMemory(mem);
        await done();
        const f = { replied: false };
        try {
            await runPlugin(p, cmd, s, f);
        } catch (e) {
            return s.reply(`卡住了：${e.message}`);
        }
        return f.replied ? undefined : s.reply(`${p.name} 收下了但没回话。`);
    }
    if (userM.pending) userM.pending = null;

    /* ---------- 回应判断指令 ---------- */
    if (/^(回应|接话|回应策略|回应日志|要不要回)$/.test(low)) {
        await done();
        return s.reply(gateReport(cfg, st, gid));
    }
    if (/^(为什么没回|怎么没回|刚才怎么没回)$/.test(low)) {
        const log = ((st.gate || {}).log || []).filter(x => !x.reply);
        if (!log.length) return s.reply('没有沉默记录，最近该回的都回了。');
        const x = log[log.length - 1];
        return s.reply(`最近一次没回：「${x.text}」\n原因：${x.reason}（分数 ${x.sc}，线在 ${x.th}）`);
    }
    {
        const m = /^想不想回[\s，,:：]*(.+)$/.exec(text);
        if (m) {
            const probe = m[1].trim();
            const ctx = {
                interests: splitList(cfg.interestWords),
                mood: cfg.moodEnabled === false ? 'calm' : st.mood,
                energy: st.energy,
                affinity: (st.affinity || {})[userM.id || uid] || 0,
                strong: false,
            };
            const { sc, why } = gateScore(probe, ctx);
            const th = Number((st.gate && st.gate.cfg && st.gate.cfg.th) || cfg.gateThreshold || 30) +
                ({ grumpy: 10, tired: 8, hype: -8, happy: -4 }[st.mood] || 0);
            const blocks = [];
            if (st.gate && st.gate.mute && st.gate.mute[gid] > Date.now()) blocks.push('本群静音中');
            if (inQuietHours(cfg.quietHours)) blocks.push('免打扰时段 ' + cfg.quietHours);
            if ((st.gate && st.gate.last[gid] || 0) + Number((st.gate && st.gate.cfg && st.gate.cfg.cd) || cfg.gateCooldown || 120) * 1000 > Date.now() && sc < 55) blocks.push('接话冷却中');
            if (sc < th) blocks.push('分数没到线');
            const yes = !blocks.length;
            return s.reply(
                `「${probe.slice(0, 40)}」→ ${yes ? '会接' : '不回'}（${sc} / 线 ${th}）\n` +
                    (why.length ? why.join('；') : '没有加分项') +
                    (yes ? '' : '\n卡在：' + blocks.join('、'))
            );
        }
    }
    if (/^闭嘴(?:[\s，,]*(\d{1,3})\s*(?:分钟|分|min)?)?$/.test(low)) {
        if (!gid) return s.reply('私聊必回，闭不了嘴。');
        const mm2 = /^闭嘴[\s，,]*(\d{1,3})?/.exec(low);
        const mins = Number((mm2 && mm2[1]) || 0) || 30;
        st.gate = st.gate || { log: [], last: {}, mute: {}, cfg: {} };
        st.gate.mute = st.gate.mute || {};
        st.gate.mute[gid] = Date.now() + mins * 60000;
        await done();
        return s.reply(`${mins} 分钟内本群不主动接话，点名和 ${prefix} 指令照常。说「${prefix} 说话」提前解禁。`);
    }
    if (/^(说话|解除静音|别闭嘴|可以说话了)$/.test(low)) {
        if (st.gate && st.gate.mute && st.gate.mute[gid]) {
            delete st.gate.mute[gid];
            await done();
            return s.reply('行，我回来了。');
        }
        return s.reply('本来就没闭。');
    }
    {
        const m = /^(?:接话)?阈值[\s，,:：]*(\d{1,3})$/.exec(low);
        if (m) {
            st.gate = st.gate || { log: [], last: {}, mute: {}, cfg: {} };
            st.gate.cfg = st.gate.cfg || {};
            st.gate.cfg.th = Number(m[1]);
            await done();
            return s.reply(`阈值调到 ${m[1]}，${m[1] >= 40 ? '我会更闷' : m[1] <= 22 ? '我会更爱插话' : '正常水平'}。`);
        }
        const c = /^(?:接话)?冷却[\s，,:：]*(\d{1,5})$/.exec(low);
        if (c) {
            st.gate = st.gate || { log: [], last: {}, mute: {}, cfg: {} };
            st.gate.cfg = st.gate.cfg || {};
            st.gate.cfg.cd = Number(c[1]);
            await done();
            return s.reply(`同群两次主动接话间隔改成 ${c[1]} 秒。`);
        }
    }

    /* ---------- 指代：问上次那个怎么样了 ---------- */
    {
        const lastE = (userM.entities || []).slice(-1)[0];
        const askBack = /^(它|他|她|这个|那个|刚才那个)[，,、\s]*(怎么样|还行|状态|挂了|好使|正常吗|还在吗|咋样)/.test(origText);
        if (lastE && askBack && Date.now() - (lastE.at || 0) < 10 * 60 * 1000) {
            const p = resolvePlugin(all, lastE.name);
            if (p) {
                if (p.admin) {
                    let ok = false;
                    try {
                        ok = !!(await s.isAdmin());
                    } catch (e) {}
                    if (!ok) return s.reply(`「${p.name}」不是你能碰的。`);
                }
                if (needsConfirm(lastE.cmd, cfg)) {
                    userM.confirm = { target: p.name, command: lastE.cmd, at: Date.now() };
                    await saveMemory(mem);
                    await done();
                    return s.reply(`「${p.name}」要执行：${lastE.cmd}\n回「确认」执行。`);
                }
                userM.last = { target: p.name, command: lastE.cmd, at: Date.now(), gid };
                await saveMemory(mem);
                await done();
                const f = { replied: false };
                try {
                    await runPlugin(p, lastE.cmd, s, f);
                } catch (e) {
                    return s.reply(`卡住了：${e.message}`);
                }
                return f.replied ? undefined : s.reply(`${p.name} 没回话。`);
            }
        }
    }

    /* ---------- 知识库与生词本 ---------- */
    if (/^(知识库|资料库|kb库)$/.test(low)) {
        if (!kbMod) return s.reply('知识库模块没加载起来，看日志 mod/kb.js。');
        const stt = kbMod.stats();
        await done();
        return s.reply(`知识库：${stt.files.join(' / ')}\n共 ${stt.chunks} 块，问法：「${prefix} 知识 NAS 装什么」`);
    }
    {
        const km = /^(?:知识|kb|查知识)[\s，,:：]*([\s\S]+)$/i.exec(text);
        if (km) {
            const q = km[1].trim();
            if (!q) return s.reply(`用法：${prefix} 知识 NAS 装什么`);
            const r = kbQuery(q, 3);
            if (!r) return s.reply(`知识库里没找到「${q}」，换个关键词试试。目前有：NAS 折腾、Bncr 踩坑、博客文章。`);
            if (cfg.kbEnabled === false) return s.reply('知识库开关是关的，去配置里打开。');
            pushHistory(userM, text, r[0].title, clamp(Number(cfg.historyRounds) || 0, 0, 10));
            await saveMemory(mem);
            await done();
            return s.reply(kbFormat(r));
        }
    }
    if (/^(生词本|学词建议|没听懂什么|生词)$/.test(low)) {
        const items = (await readMiss()).sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 10);
        if (!items.length) return s.reply('还没攒下生词，说明该认的都认了。');
        const lines = [`最近没接住的话（共 ${items.length} 条）：`];
        items.forEach((x, i) => {
            const cand = searchPlugins(all, x.k).slice(0, 2).map(p => p.name);
            lines.push(`${i + 1}. ${x.t} ×${x.n}${cand.length ? ' → 可能是 ' + cand.join(' / ') : ''}`);
        });
        lines.push(`补词：${prefix} 学词 关键词 => 插件名`);
        return s.reply(lines.join('\n'));
    }
    if (/^(清空生词|清空生词本)$/.test(low)) {
        if (modStore) await modStore.set('miss', 'items', []);
        return s.reply('生词本清空了。');
    }

    /* ---------- 记忆指令 ---------- */
    if (/^(记住|记一下|记着|帮我记住|记住一下)/.test(low)) {
        const fact = text.replace(/^(记住|记一下|记着|帮我记住|记住一下)\s*/, '').trim();
        if (!fact) return s.reply('记住什么？说完整点。');
        if (!userM.facts.includes(fact)) userM.facts.push(fact);
        while (userM.facts.length > 40) userM.facts.shift();
        await saveMemory(mem);
        await done();
        return s.reply(`记下了：${fact}`);
    }
    if (/^(忘记|忘掉|删掉记忆|别记)/.test(low)) {
        const kw = stripFillers(text.replace(/^(忘记|忘掉|删掉记忆|别记)\s*/, '').trim());
        if (!kw) return s.reply('要忘掉哪个关键词？');
        const before = userM.facts.length;
        userM.facts = userM.facts.filter(f => !f.includes(kw));
        await saveMemory(mem);
        await done();
        return s.reply(before === userM.facts.length ? `没找到跟「${kw}」有关的记忆。` : `删了 ${before - userM.facts.length} 条。`);
    }
    if (/^(清空记忆|清除记忆|全忘掉|resetmemory)$/.test(low)) {
        userM.facts = [];
        userM.history = [];
        await saveMemory(mem);
        await done();
        return s.reply('关于你的记忆清空了，名字还留着。');
    }
    if (/^(你记得什么|记忆|我的记忆|mem)$/.test(low)) {
        const lines = [];
        if (userM.name) lines.push(`· 你叫 ${userM.name}`);
        for (const f of userM.facts) lines.push(`· ${f}`);
        lines.push(`· 好感度 ${st.affinity[uid] || 0}，当前心情 ${moodLabel(st)}`);
        return s.reply(lines.length > 1 ? '关于你我记得：\n' + lines.join('\n') : '对你暂时一无所知，说句「' + prefix + ' 记住 xxx」我就记。');
    }
    if (/^(我是谁|我叫什么|你知道我是谁吗)$/.test(low)) {
        return s.reply(userM.name ? `你是 ${userM.name}。` : '你还没告诉过我名字，说「' + prefix + ' 我叫xxx」。');
    }

    /* ---------- 词库指令 ---------- */
    if (/^(词库|意图|词条)$/.test(low)) {
        const learned = lex.intents.filter(i => !DEFAULT_INTENTS.some(d => d.target === i.target && d.keys[0] === (i.keys || [])[0]));
        const lines = lex.intents.slice(0, 12).map(i => `· ${(i.keys || []).slice(0, 4).join('/')} → ${i.target}`);
        return s.reply(
            `本地词库 ${lex.intents.length} 条（自学 ${learned.length} 条）：\n` +
                lines.join('\n') +
                `\n改词：${prefix} 学词 关键词 => 插件名；${prefix} 删词 关键词`
        );
    }
    if (/^(学词|学一下|添加词条|新增词条)/.test(low)) {
        const body = text.replace(/^(学词|学一下|添加词条|新增词条)\s*/, '').trim();
        const m = body.match(/^(.{1,20}?)\s*(?:=>|->|＝>|＝|=|→)\s*(.{1,40})$/);
        if (!m) return s.reply(`格式：${prefix} 学词 关键词 => 插件名 [命令模板]\n例如：${prefix} 学词 查快递 => SSH终端管家Pro`);
        const kw = m[1].trim();
        const rest = m[2].trim();
        const parts = rest.split(/\s+/);
        const targetName = parts[0];
        const tpl = parts.slice(1).join(' ') || '${q}';
        const p = resolvePlugin(all, targetName);
        if (!p) return s.reply(`没找到插件「${targetName}」，先发「${prefix} 词库」看看能调什么。`);
        const exist = lex.intents.findIndex(i => (i.keys || []).includes(kw));
        const item = { keys: [kw], target: p.name, t: tpl };
        if (exist >= 0) lex.intents[exist] = item;
        else lex.intents.push(item);
        await saveLexicon(lex);
        return s.reply(`学会了：说「${kw}」→ ${p.name}${tpl !== '${q}' ? '（' + tpl + '）' : ''}`);
    }
    if (/^(删词|删除词条|忘词)/.test(low)) {
        const kw = text.replace(/^(删词|删除词条|忘词)\s*/, '').trim();
        if (!kw) return s.reply('要删哪个关键词？');
        const before = lex.intents.length;
        lex.intents = lex.intents.filter(i => !(i.keys || []).includes(kw));
        await saveLexicon(lex);
        return s.reply(before === lex.intents.length ? `词库里没有「${kw}」。` : `删掉了「${kw}」。`);
    }
    if (/^(你会什么|你能干啥|能干什么|帮助|help|功能列表)$/.test(low)) {
        return s.reply(helpText(cfg, lex, all, prefix));
    }
    if (/^(找插件|有没有.*插件|能干什么插件|插件搜索)/.test(low)) {
        const q = text.replace(/^(找插件|有没有|能干什么插件|插件搜索)/, '').replace(/插件(吗|么|呢)?$/, '').trim() || low;
        const hits = searchPlugins(all, q);
        if (!hits.length) return s.reply(`没找到跟「${q}」相关的插件，发「${prefix} 词库」看现有能力。`);
        return s.reply('可能对得上：\n' + hits.map(p => `· ${p.name}：${p.desc || '无说明'}（${p.rules[0]}）`).join('\n'));
    }
    const bi = builtinReply(text);
    if (bi) return s.reply(bi);

    if (/^(刷新插件|重载插件|刷新入库)$/.test(low)) {
        const fresh = scanPlugins(true).filter(p => !splitList(cfg.excludePlugins).includes(p.name));
        return s.reply(`已重新入库：${fresh.length} 个插件，新装的可以直接调。`);
    }
    if (/^(技能|mod技能|技能列表)$/.test(low)) {
        const skills = loadSkills();
        return s.reply(
            skills.length
                ? 'mod 技能（plugins/xinz/mod）：\n' + skills.map(k => `· ${k.name}：${k.desc || '无说明'}`).join('\n') + `\n调用：${prefix} 跑 <技能名> [参数]`
                : '还没有注册 mod 技能，编辑 plugins/xinz/mod/skills.json 即可。'
        );
    }
    if (/^(跑|运行技能|执行技能)\s*(.+)$/.test(low)) {
        const body = text.replace(/^(跑|运行技能|执行技能)\s*/, '').trim();
        const parts = body.split(/\s+/);
        const name = parts.shift();
        const sk = loadSkills().find(k => k.name === name) || loadSkills().find(k => new RegExp(escRe(k.name), 'i').test(name));
        if (!sk) return s.reply(`没找到技能「${name}」，发「${prefix} 技能」看列表。`);
        try {
            const out = await runSkill(sk, parts);
            return s.reply(out ? out.slice(0, 1200) : `${sk.name} 执行完了，没有输出。`);
        } catch (e) {
            return s.reply(`技能 ${sk.name} 失败：${e.message}`);
        }
    }

    // 自动记名字 / 常住地 / 喜好
    const nameHit = text.match(/(?:我叫|我是|叫我)\s*([\u4e00-\u9fa5A-Za-z0-9_]{1,12})/);
    if (nameHit && !/谁|什么|吗|呢/.test(nameHit[1])) userM.name = nameHit[1];
    const cityHit = text.match(/(?:我在|我住|住在|坐标)([\u4e00-\u9fa5]{2,6})/);
    if (cityHit) {
        const fact = `住在${cityHit[1]}`;
        if (!userM.facts.includes(fact)) userM.facts.push(fact);
    }
    const likeHit = text.match(/(我喜欢|我爱吃|爱吃|我讨厌|我不吃)([^，。！？、\s]{1,10})/);
    if (likeHit) {
        const fact = likeHit[0];
        if (!userM.facts.includes(fact)) userM.facts.push(fact);
    }
    if (nameHit || cityHit || likeHit) {
        while (userM.facts.length > 40) userM.facts.shift();
        await saveMemory(mem);
    }
    const ack = nameHit ? `记住你叫 ${userM.name} 了。` : cityHit ? `记下你在${cityHit[1]}了。` : '';

    /* ---------- 情绪与好感 ---------- */
    let deltaA = 0;
    if (/(谢谢|辛苦|爱你|牛|厉害|棒|靠谱)/.test(text)) deltaA += 1;
    if (/(垃圾|废物|傻|滚|闭嘴|烦死|蠢)/.test(text)) deltaA -= 2;
    st.affinity[uid] = clamp((st.affinity[uid] || 0) + deltaA, -10, 20);

    const rounds = clamp(Number(cfg.historyRounds) || 0, 0, 10);

    /* ---------- 大模型优先 ---------- */
    let plan = null;
    if (String(cfg.apiKey || '').trim()) {
        try {
            plan = await think(cfg, text, all, st, uid, mem, userM);
        } catch (e) {
            console.warn('[智能管家] 大脑掉线，走本地词库:', e.message);
        }
    }
    // 校验模型给的执行计划，防止乱造命令
    if (plan && plan.action === 'run') {
        const p = resolvePlugin(all, plan.plugin || '');
        const cmd0 = String(plan.command || '').trim();
        if (!p || !cmd0 || !ruleFits(p, cmd0)) {
            if (cfg.debug) console.warn('[智能管家] 模型命令不可执行，降级:', plan.plugin, cmd0);
            plan = { action: 'none', reply: plan.reply || '' };
        } else {
            plan.meta = p;
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
        const reply = sanitizeReply(plan.reply) + (ack ? '\n' + ack : '');
        pushHistory(userM, text, reply, rounds);
        await saveMemory(mem);
        await done();
        return s.reply(reply);
    }
    if (plan && plan.action === 'run' && plan.meta) {
        const p = plan.meta;
        const cmd = String(plan.command).trim();
        if (p.admin) {
            let ok = false;
            try {
                ok = !!(await s.isAdmin());
            } catch (e) {}
            const wx = await new BncrDB('wxClawBot').get('ownerId', '');
            if (!ok && wx && uid === wx) ok = true;
            if (!ok) {
                await done();
                return s.reply(`「${p.name}」不是你能碰的。`);
            }
        }
        userM.last = { target: p.name, command: cmd, at: Date.now() };
        await saveMemory(mem);
        await done();
        const flag = { replied: false };
        try {
            if (cfg.debug) console.log(`[智能管家] LLM 决策 → ${p.name} ← ${cmd}`);
            await runPlugin(p, cmd, s, flag);
        } catch (e) {
            console.error('[智能管家] 执行失败:', e.message);
            return s.reply(`卡住了：${e.message}`);
        }
        if (!flag.replied) return s.reply(`${p.name} 收下了但没回话，可能卡住了。`);
        return;
    }

    /* ---------- 多意图 ---------- */
    const segs = String(text).split(/和|、|;|；/).map(x => x.trim()).filter(x => x.length >= 2);
    if (segs.length >= 2 && segs.length <= 3) {
        const plans = [];
        for (const seg of segs) {
            const h = pickIntent(applySynonyms(normalize(seg)), lex.intents);
            if (!h) break;
            const cmd = renderCmd(h.it, extractQueryFrom(seg, applySynonyms(normalize(seg)), h.key));
            const p = resolvePlugin(all, h.it.target);
            if (!p || !cmd) break;
            plans.push({ p, cmd });
        }
        if (plans.length === segs.length) {
            userM.last = { target: plans[0].p.name, command: plans[0].cmd, at: Date.now(), gid };
            await saveMemory(mem);
            await done();
            for (const plan of plans) {
                if (plan.p.admin && !(await s.isAdmin().catch(() => false))) {
                    await s.reply(`「${plan.p.name}」不是你能碰的。`);
                    continue;
                }
                if (needsConfirm(plan.cmd, cfg)) {
                    userM.confirm = { target: plan.p.name, command: plan.cmd, at: Date.now() };
                    await saveMemory(mem);
                    await done();
                    return s.reply(`「${plan.p.name}」要执行：${plan.cmd}\n回「确认」执行，其余分段先停。`);
                }
                const f = { replied: false };
                try {
                    await runPlugin(plan.p, plan.cmd, s, f);
                } catch (e) {
                    await s.reply(`${plan.p.name} 卡住了：${e.message}`);
                }
                if (!f.replied) await s.reply(`${plan.p.name} 收下了但没回话。`);
                await new Promise(r => setTimeout(r, 600));
            }
            return;
        }
    }

    /* ---------- 本地意图路由 ---------- */
    let target = null;
    let command = '';
    let intent = null;
    let hit = pickIntent(lowx, lex.intents);
    if (!hit) {
        const fz = fuzzyIntents(lowx, lex.intents);
        if (fz && fz.score >= 0.66) hit = { it: fz.it, key: fz.key, fuzzy: true };
    }
    if (hit) {
        const q = hit.fuzzy ? '' : extractQueryFrom(text, lowx, hit.key);
        const need = SLOT_ASK[hit.it.target];
        if (cfg.slotFill !== false && need && !q && String(hit.it.t || '').indexOf('${q}') >= 0) {
            userM.pending = { target: hit.it.target, tpl: hit.it.t, at: Date.now() };
            await saveMemory(mem);
            await done();
            return s.reply(`「${hit.it.target}」还差个${need.slot}。${need.ask}`);
        }
        const cmd = renderCmd(hit.it, q);
        const p = resolvePlugin(all, hit.it.target);
        if (p && cmd) {
            target = p;
            command = cmd;
            intent = hit.it;
        }
    }

    // 上一轮意图延续（"那明天呢"），10 分钟内、同一会话才认
    if (!target && userM.last && Date.now() - (userM.last.at || 0) < 10 * 60 * 1000 &&
        (userM.last.gid || '') === gid && /^(那|这|明天|后天|它|他)/.test(low)) {
        const p = resolvePlugin(all, userM.last.target);
        if (p) {
            target = p;
            command = userM.last.command;
        }
    }

    // 原始命令直接命中
    if (!target) {
        for (const p of all) {
            if (p.rules.some(r => isSpecificRule(r) && ruleFits({ rules: [r] }, text))) {
                target = p;
                command = text;
                break;
            }
        }
    }

    if (!target) {
        const chat = lex.chat.find(c => pickKey(lowx, c.keys));
        if (chat) {
            const reply = offlineChat(chat, cfg, st, userM);
            pushHistory(userM, text, reply, rounds);
            await saveMemory(mem);
            await done();
            const extra = userM.facts.length && Math.random() < 0.3 ? `（你不是说过${userM.facts.slice(-1)[0]}吗）` : '';
            return s.reply(reply + extra + (ack ? '\n' + ack : ''));
        }
        if (ack) {
            await saveMemory(mem);
            await done();
            return s.reply(ack);
        }
        if (cfg.kbEnabled !== false && /一-龥|nas|docker|bncr|博客|装什么|怎么装|推荐|有没有|写过/.test(lowx)) {
            const kbr = kbQuery(text, 2);
            if (kbr && kbr[0].score >= Number(cfg.kbThreshold || 1)) {
                pushHistory(userM, text, kbr[0].title, rounds);
                await saveMemory(mem);
                await done();
                return s.reply(kbFormat(kbr));
            }
        }
        if (/(觉得|怎么看|为什么|是不是|要不要|好不好|靠谱吗|行不行)/.test(text)) {
            pushHistory(userM, text, '', rounds);
            await done();
            return s.reply(opinionReply(cfg, st));
        }
        if (lowx.length <= 8 && !/[0-9]/.test(lowx)) {
            await done();
            if (gatePassed) return s.reply(chimeReply(text, cfg, st, all));
            return s.reply(`嗯，${userM.name || '你说'}。有事就直说，${prefix} + 需求。`);
        }
        await addMiss(text, gid);
        const cand = searchPlugins(all, lowx).map(p => p.name);
        if (gatePassed) {
            await done();
            return s.reply(chimeReply(text, cfg, st, all));
        }
        const hints = lex.intents.slice(0, 3).map(i => `${prefix} ${i.keys[0]}`);
        await done();
        return s.reply(
            `没听懂。${cfg.name}能办：${hints.join('、')}…\n` +
                (cand.length ? `你说的可能对应：${cand.join(' / ')}\n` : '') +
                `发「${prefix} 你会什么」看全部能力。`
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
            await done();
            return s.reply(`「${target.name}」不是你能碰的。`);
        }
    }

    if (needsConfirm(command, cfg)) {
        userM.confirm = { target: target.name, command, at: Date.now() };
        await saveMemory(mem);
        await done();
        return s.reply(`「${target.name}」要执行：${command}\n这动作有点重，回「确认」执行（60 秒内有效），回「取消」算了。`);
    }

    userM.last = { target: target.name, command, at: Date.now(), gid };
    pushEntity(userM, target.name, command);
    await saveMemory(mem);
    await done();

    const flag = { replied: false };
    try {
        if (cfg.debug) console.log(`[智能管家] ${uid} → ${target.name} ← ${command} (${moodLabel(st)})`);
        await runPlugin(target, command, s, flag);
    } catch (e) {
        console.error('[智能管家] 执行失败:', e.message);
        return s.reply(`卡住了：${e.message}`);
    }
    if (!flag.replied) return s.reply(`${target.name} 收下了但没回话，可能卡住了。`);
};