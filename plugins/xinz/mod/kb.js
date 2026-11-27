/**
 * mod/kb.js —— 本地知识库：读 mod/kb/*.md，切块后做 BM25 检索
 * 纯本地、无网络、无模型，适合回答「装什么 / 怎么配 / 写过什么」
 */
const fs = require('fs');
const path = require('path');

const KB_DIR = path.join(__dirname, 'kb');
const CHUNK_SIZE = 420;
let cache = { sig: '', chunks: [], df: {}, avg: 1 };

function walk(dir, out) {
    let list = [];
    try {
        list = fs.readdirSync(dir);
    } catch (e) {
        return out;
    }
    for (const name of list) {
        if (name.startsWith('.')) continue;
        const full = path.join(dir, name);
        let st = null;
        try {
            st = fs.statSync(full);
        } catch (e) {
            continue;
        }
        if (st.isDirectory()) walk(full, out);
        else if (/\.(md|txt)$/i.test(name)) out.push(full);
    }
    return out;
}
function files() {
    return walk(KB_DIR, []);
}
function sigOf(list) {
    return list.map(f => {
        try {
            const st = fs.statSync(f);
            return f + ':' + st.mtimeMs + ':' + st.size;
        } catch (e) {
            return f;
        }
    }).join('|');
}
function tokenize(text) {
    const s = String(text || '').toLowerCase();
    const out = [];
    const latin = s.match(/[a-z0-9][a-z0-9_.+-]{1,}/g) || [];
    for (const w of latin) out.push(w);
    const cjk = s.match(/[\u4e00-\u9fa5]+/g) || [];
    for (const run of cjk) {
        if (run.length === 1) out.push(run);
        for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
    }
    return out;
}
function splitChunks(file) {
    let raw = '';
    try {
        raw = fs.readFileSync(file, 'utf8');
    } catch (e) {
        return [];
    }
    const lines = raw.split(/\r?\n/);
    const chunks = [];
    let title = path.basename(file, path.extname(file));
    let buf = [];
    let size = 0;
    const flush = () => {
        const text = buf.join('\n').trim();
        if (text) {
            const first = text.split('\n')[0];
            let t = /^-\s+/.test(first) ? first.replace(/^-\s+/, '') : title;
            t = t.replace(/\*\*/g, '').replace(/https?:\/\/\S+/g, '').replace(/[：:]\s*$/, '').trim().slice(0, 48);
            chunks.push({ file: path.relative(KB_DIR, file).replace(/\\/g, '/'), title: t, text });
        }
        buf = [];
        size = 0;
    };
    for (const line of lines) {
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        if (h) {
            flush();
            title = h[2].trim();
            buf.push(line);
            size += line.length;
            continue;
        }
        if (/^- /.test(line) && size > 40) flush();
        buf.push(line);
        size += line.length;
        if (size >= CHUNK_SIZE) flush();
    }
    flush();
    return chunks;
}
function build() {
    const list = files();
    const sig = sigOf(list);
    if (sig === cache.sig && cache.chunks.length) return cache;
    const chunks = [];
    for (const f of list) {
        if (path.basename(f) === 'index.md') continue;
        chunks.push(...splitChunks(f));
    }
    const df = {};
    for (const c of chunks) {
        const seen = new Set(tokenize(c.title + '\n' + c.text));
        for (const t of seen) df[t] = (df[t] || 0) + 1;
        c.tokens = tokenize(c.text);
        c.titleTokens = tokenize(c.title);
    }
    const avg = chunks.reduce((a, c) => a + c.tokens.length, 0) / (chunks.length || 1);
    cache = { sig, chunks, df, avg };
    return cache;
}
function bm25(query, limit) {
    const { chunks, df, avg } = build();
    const q = tokenize(query);
    if (!q.length || !chunks.length) return [];
    const N = chunks.length;
    const k1 = 1.5;
    const b = 0.75;
    const scored = chunks.map(c => {
        const tf = {};
        for (const t of c.tokens) tf[t] = (tf[t] || 0) + 1;
        const ttf = {};
        for (const t of c.titleTokens) ttf[t] = (ttf[t] || 0) + 1;
        let s = 0;
        for (const t of q) {
            const f = tf[t] || 0;
            const ft = ttf[t] || 0;
            if (!f && !ft) continue;
            const idf = Math.log(1 + (N - (df[t] || 0) + 0.5) / ((df[t] || 0) + 0.5));
            const norm = k1 * (1 - b + (b * c.tokens.length) / (avg || 1));
            s += idf * ((f + 2 * ft) * (k1 + 1)) / (f + 2 * ft + norm);
        }
        return { ...c, score: s / q.length };
    });
    return scored.filter(x => x.score > 0).sort((a, b2) => b2.score - a.score).slice(0, limit || 3);
}
function stats() {
    const { chunks } = build();
    const list = files().map(f => path.relative(KB_DIR, f).replace(/\\/g, '/'));
    return { files: list, chunks: chunks.length };
}
module.exports = { search: bm25, stats, tokenize };
